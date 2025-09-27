import { Effect, Fiber, Layer, Schema, Stream, pipe } from 'effect';
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

      // Setup: Create stream ID and beginning position
      return pipe(
        newEventStreamId(),
        Effect.flatMap((streamId) =>
          pipe(
            streamId,
            beginning,
            Effect.flatMap((streamBeginning) =>
              pipe(
                // First, write one event to establish the stream
                FooEventStore,
                Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                  pipe(
                    Stream.make({ bar: 'initial-event' }),
                    Stream.run(eventstore.append(streamBeginning))
                  )
                ),
                Effect.flatMap(() =>
                  // Now test cross-instance subscription
                  pipe(
                    // Instance 2: Start subscription from after initial event
                    pipe(
                      FooEventStore,
                      Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                        pipe(
                          eventstore.subscribe({ streamId, eventNumber: 1 }),
                          Effect.flatMap((stream) =>
                            pipe(
                              stream,
                              Stream.take(1), // Expect 1 event to be written by instance 1
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
                      Effect.fork
                    ),
                    Effect.flatMap((subscribeFiber) =>
                      pipe(
                        // Give subscription time to establish
                        Effect.sleep(1000),
                        Effect.flatMap(() =>
                          // Instance 1: Write new event to the stream
                          pipe(
                            FooEventStore,
                            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                              pipe(
                                Stream.make({ bar: 'cross-instance-event' }),
                                Stream.run(eventstore.append({ streamId, eventNumber: 1 }))
                              )
                            )
                          )
                        ),
                        Effect.flatMap(() =>
                          // Wait for subscription to complete
                          pipe(
                            Fiber.join(subscribeFiber),
                            Effect.timeout(3000),
                            Effect.orElse(() => Effect.void)
                          )
                        ),
                        Effect.tap(() =>
                          // Verify that instance 2 received event written by instance 1
                          Effect.sync(() => {
                            expect(receivedEvents).toEqual([{ bar: 'cross-instance-event' }]);
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        ),
        Effect.provide(FooEventStoreLive),
        Effect.provide(
          Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, LoggerLive)
        ),
        Effect.provide(PostgresLive),
        Effect.provide(makePgConfigurationLive('TEST_PG'))
      );
    },
    10000
  );
});
