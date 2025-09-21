import { Logger, Effect, Layer, Schema, Stream, pipe, ParseResult } from 'effect';
import { describe, expect, it } from 'bun:test';
import {
  runEventStoreTestSuite,
  FooEventStore,
  newEventStreamId,
  beginning,
  type EventStore,
  encodedEventStore,
  EventStoreError,
} from '@codeforbreakfast/eventsourcing-store';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  makePgConfigurationLive,
} from './index';

const LoggerLive = Logger.pretty;

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;
const JsonFooEvent = Schema.parseJson(FooEvent);

export const FooEventStoreLive = Layer.effect(
  FooEventStore,
  pipe(sqlEventStore(), Effect.map(encodedEventStore(JsonFooEvent)))
);

// Run the shared test suite for the PostgreSQL implementation
runEventStoreTestSuite('PostgreSQL', () =>
  pipe(
    FooEventStoreLive,
    Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, LoggerLive)),
    Layer.provide(PostgresLive),
    Layer.provide(makePgConfigurationLive('TEST_PG'))
  )
);

/**
 * Test true horizontal scaling with separate PostgreSQL connections
 * This simulates multiple API instances with independent database connections
 */
describe('PostgreSQL Horizontal Scaling', () => {
  it('should propagate events between separate application instances', async () => {
    const receivedEvents: FooEvent[] = [];

    // Create two separate EventStore instances with independent layers
    const createPostgresLayer = () =>
      pipe(
        FooEventStoreLive,
        Layer.provide(
          Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, LoggerLive)
        ),
        Layer.provide(PostgresLive),
        Layer.provide(makePgConfigurationLive('TEST_PG'))
      );

    const instance1Layer = createPostgresLayer();
    const instance2Layer = createPostgresLayer();

    const runWithInstance1 = <A>(
      effect: Effect.Effect<A, ParseResult.ParseError | EventStoreError, FooEventStore>
    ): Promise<A> => {
      return pipe(effect, Effect.provide(instance1Layer), Effect.runPromise);
    };

    const runWithInstance2 = <A>(
      effect: Effect.Effect<A, ParseResult.ParseError | EventStoreError, FooEventStore>
    ): Promise<A> => {
      return pipe(effect, Effect.provide(instance2Layer), Effect.runPromise);
    };

    // Setup: Create stream ID and beginning position using instance 1
    const streamIdEffect = newEventStreamId();
    const streamId = await Effect.runPromise(streamIdEffect);
    const streamBeginning = await pipe(streamId, beginning, Effect.runPromise);

    // Instance 2: Start subscription BEFORE any events are written
    const subscriptionPromise = runWithInstance2(
      pipe(
        FooEventStore,
        Effect.flatMap((eventstore: EventStore<FooEvent>) =>
          pipe(
            // Subscribe from the beginning
            eventstore.subscribe(streamBeginning),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(2), // Expect 2 events to be written by instance 1
                Stream.tap((event) =>
                  Effect.sync(() => {
                    receivedEvents.push(event);
                  })
                ),
                Stream.runDrain
              )
            )
          )
        )
      )
    ).catch(() => {
      // Handle subscription errors gracefully
    });

    // Give subscription time to establish connection and start listening
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Instance 1: Write events to the stream
    await runWithInstance1(
      pipe(
        FooEventStore,
        Effect.flatMap((eventstore: EventStore<FooEvent>) =>
          pipe(
            Stream.make({ bar: 'cross-instance-event-1' }, { bar: 'cross-instance-event-2' }),
            Stream.run(eventstore.write(streamBeginning))
          )
        )
      )
    );

    // Wait for the subscription to complete or timeout
    await Promise.race([
      subscriptionPromise,
      new Promise((resolve) => setTimeout(resolve, 2000)), // Longer timeout for cross-instance communication
    ]);

    // Give extra time for any async cleanup before test ends
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that instance 2 received events written by instance 1
    expect(receivedEvents).toEqual([
      { bar: 'cross-instance-event-1' },
      { bar: 'cross-instance-event-2' },
    ]);
  }, 10000); // Longer test timeout for multi-instance setup
});
