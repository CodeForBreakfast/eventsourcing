import { Effect, Layer, Schema, Stream, pipe } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/buntest';
import { silentLogger } from '@codeforbreakfast/buntest';
import {
  runEventStoreTestSuite,
  FooEventStore,
  newEventStreamId,
  beginning,
  type EventStore,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  makePgConfigurationLive,
} from './index';

const LoggerLive = silentLogger;

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
  it.effect(
    'should propagate events between separate application instances',
    () => {
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

      // Setup: Create stream ID and beginning position
      return pipe(
        newEventStreamId(),
        Effect.flatMap((streamId) =>
          pipe(
            streamId,
            beginning,
            Effect.flatMap((streamBeginning) =>
              pipe(
                // Instance 2: Start subscription in the background
                pipe(
                  FooEventStore,
                  Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                    pipe(
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
                  ),
                  Effect.provide(instance2Layer),
                  Effect.fork
                ),
                Effect.flatMap((subscribeFiber) =>
                  pipe(
                    // Give subscription time to establish
                    Effect.sleep(200),
                    Effect.flatMap(() =>
                      // Instance 1: Write events to the stream
                      pipe(
                        FooEventStore,
                        Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                          pipe(
                            Stream.make(
                              { bar: 'cross-instance-event-1' },
                              { bar: 'cross-instance-event-2' }
                            ),
                            Stream.run(eventstore.append(streamBeginning))
                          )
                        ),
                        Effect.provide(instance1Layer)
                      )
                    ),
                    Effect.flatMap(() =>
                      // Wait for subscription to complete or timeout
                      pipe(
                        subscribeFiber.join,
                        Effect.timeout(2000),
                        Effect.orElse(() => Effect.void)
                      )
                    ),
                    Effect.tap(() =>
                      // Verify that instance 2 received events written by instance 1
                      Effect.sync(() => {
                        expect(receivedEvents).toEqual([
                          { bar: 'cross-instance-event-1' },
                          { bar: 'cross-instance-event-2' },
                        ]);
                      })
                    )
                  )
                )
              )
            )
          )
        )
      );
    },
    10000
  ); // Longer test timeout for multi-instance setup
});
