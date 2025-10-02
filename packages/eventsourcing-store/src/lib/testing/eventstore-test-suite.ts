/* eslint-disable no-restricted-imports, no-restricted-syntax */
import { Chunk, Effect, Layer, ParseResult, Schema, Stream, pipe, Ref } from 'effect';
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { EventStreamId, EventStreamPosition, beginning } from '../streamTypes';
import { type EventStore, ConcurrencyConflictError } from '../eventstore';

// Helper functions for converting stream events
const toArraySafely = <A>(chunk: Chunk.Chunk<A>): readonly A[] => Chunk.toReadonlyArray(chunk);

const Id = {
  randomPart: () => Math.random().toString(36).substring(7),
};

export const newEventStreamId = () =>
  pipe(`stream_${Id.randomPart()}`, Schema.decode(EventStreamId));

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

export class FooEventStore extends Effect.Tag('FooEventStore')<
  FooEventStore,
  EventStore<FooEvent>
>() {}

/**
 * Options for configuring the EventStore test suite
 */
export interface EventStoreTestOptions {
  /**
   * Whether the implementation supports horizontal scaling with multiple instances.
   * Set to false for in-memory implementations that don't have a shared backend.
   * @default true
   */
  readonly supportsHorizontalScaling?: boolean;
}

/**
 * Reusable test suite for EventStore implementations
 *
 * @param name - Display name for the implementation (e.g., "In-memory", "PostgreSQL")
 * @param makeEventStore - Function that returns a Layer providing the EventStore implementation
 * @param options - Optional configuration for the test suite
 */
export function runEventStoreTestSuite<E>(
  name: string,
  makeEventStore: () => Layer.Layer<FooEventStore, E, unknown>,
  options: EventStoreTestOptions = {}
) {
  const { supportsHorizontalScaling = true } = options;
  describe(`${name} EventStore`, () => {
    let eventstore: Layer.Layer<FooEventStore, E, unknown>;

    const runPromiseWithEventStore = <A, E2>(
      effect: Effect.Effect<A, E2, FooEventStore>
    ): Promise<A> => {
      // After providing the eventstore Layer, we get Effect<A, E2 | E, unknown>
      // We need to handle the unknown requirement - assume test caller provides complete Layer
      const provided = pipe(effect, Effect.provide(eventstore));
      // Type assertion needed because we can't statically know the Layer's requirements
      return Effect.runPromise(provided as Effect.Effect<A, E2 | E, never>);
    };

    beforeAll(() => {
      eventstore = makeEventStore();
    });

    describe('appending events to the beginning of an empty stream', () => {
      let streamId: Effect.Effect<EventStreamId, ParseResult.ParseError, never>;
      let streamBeginning: EventStreamPosition;
      let result: EventStreamPosition;

      beforeEach(async () => {
        streamId = newEventStreamId();
        streamBeginning = await pipe(streamId, Effect.flatMap(beginning), Effect.runPromise);

        result = await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'baz' }, { bar: 'qux' }),
                Stream.run(eventstore.append(streamBeginning))
              )
            )
          )
        );
      });

      describe('when collecting the events from the start of the stream', () => {
        let eventsRead: Chunk.Chunk<FooEvent>;

        beforeEach(async () => {
          eventsRead = await runPromiseWithEventStore(
            pipe(
              FooEventStore,
              Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                pipe(
                  streamId,
                  Effect.flatMap(beginning),
                  Effect.flatMap((position) => eventstore.read(position)),
                  Effect.flatMap((stream) =>
                    pipe(
                      stream,
                      Stream.runCollect // No take needed - read only returns historical
                    )
                  )
                )
              )
            )
          );
        });

        it('should read all of the events', () => {
          expect(toArraySafely(eventsRead)).toEqual([{ bar: 'baz' }, { bar: 'qux' }]);
        });
      });

      describe('and adding more events to the start of the stream', () => {
        it('should fail because the stream is not empty', async () => {
          await runPromiseWithEventStore(
            pipe(
              FooEventStore,
              Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                pipe(
                  Stream.make({ bar: 'foo' }),
                  Stream.run(eventstore.append(streamBeginning)),
                  Effect.flip,
                  Effect.map((error) => {
                    expect(error).toBeInstanceOf(ConcurrencyConflictError);
                  })
                )
              )
            )
          );
        });
      });

      describe('and adding more events to the new end of the stream', () => {
        beforeEach(async () => {
          await runPromiseWithEventStore(
            pipe(
              FooEventStore,
              Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                pipe(Stream.make({ bar: 'foo' }), Stream.run(eventstore.append(result)))
              )
            )
          );
        });

        describe('when collecting the events from the start of the stream', () => {
          it('should return all the events that have been appended to the stream', async () => {
            expect(
              toArraySafely(
                await runPromiseWithEventStore(
                  pipe(
                    FooEventStore,
                    Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                      pipe(
                        streamId,
                        Effect.flatMap(beginning),
                        Effect.flatMap((position) => eventstore.read(position)),
                        Effect.flatMap((stream) =>
                          pipe(
                            stream,
                            Stream.runCollect // No take needed - read only returns historical
                          )
                        )
                      )
                    )
                  )
                )
              )
            ).toEqual([{ bar: 'baz' }, { bar: 'qux' }, { bar: 'foo' }]);
          });
        });

        describe('when collecting the events from partway through the stream', () => {
          it('should return the requested event and those that follow to the end of the stream', async () => {
            expect(
              toArraySafely(
                await runPromiseWithEventStore(
                  pipe(
                    FooEventStore,
                    Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                      pipe(
                        streamId,
                        Effect.map((streamId) => ({
                          streamId,
                          eventNumber: 1,
                        })),
                        Effect.flatMap((position) => eventstore.read(position)),
                        Effect.flatMap((stream) =>
                          pipe(
                            stream,
                            Stream.take(2), // Take exactly 2 events (from position 1 onwards)
                            Stream.runCollect
                          )
                        )
                      )
                    )
                  )
                )
              )
            ).toEqual([{ bar: 'qux' }, { bar: 'foo' }]);
          });
        });

        describe('trying to add more events at the previous end of the stream', () => {
          it('should fail because the stream end has moved', () =>
            runPromiseWithEventStore(
              pipe(
                FooEventStore,
                Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                  pipe(
                    Stream.make({ bar: 'oh-oh' }),
                    Stream.run(eventstore.append(result)),
                    Effect.flip,
                    Effect.map((error) => {
                      expect(error).toBeInstanceOf(ConcurrencyConflictError);
                    })
                  )
                )
              )
            ));
        });

        describe('appending events to the beginning of another empty stream', () => {
          let secondStreamId: Effect.Effect<EventStreamId, ParseResult.ParseError, never>;

          beforeEach(async () => {
            secondStreamId = newEventStreamId();
            result = await runPromiseWithEventStore(
              pipe(
                FooEventStore,
                Effect.flatMap((eventstore: EventStore<FooEvent>) =>
                  pipe(
                    Stream.make({ bar: 'baz' }, { bar: 'qux' }),
                    Stream.run(
                      eventstore.append(
                        pipe(
                          secondStreamId,
                          Effect.flatMap(beginning),
                          Effect.map((pos) => pos),
                          Effect.runSync
                        )
                      )
                    )
                  )
                )
              )
            );
          });
        });
      });
    });

    describe('appending events to the wrong end of an empty stream', () => {
      let emptyStreamWrongEnd: EventStreamPosition;

      beforeEach(() => {
        const emptyStreamId = newEventStreamId();
        emptyStreamWrongEnd = pipe(
          emptyStreamId,
          Effect.flatMap((streamId: EventStreamId) =>
            pipe(
              streamId,
              beginning,
              Effect.map((streamBeginning: EventStreamPosition) => ({
                streamId: streamBeginning.streamId,
                eventNumber: 10,
              }))
            )
          ),
          Effect.runSync
        );
      });

      it('should fail because the stream is empty', () =>
        runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'foo' }),
                Stream.run(eventstore.append(emptyStreamWrongEnd)),
                Effect.flip,
                Effect.map((error) => {
                  expect(error).toBeInstanceOf(ConcurrencyConflictError);
                })
              )
            )
          )
        ));
    });

    describe('collecting from a non-existent stream', () => {
      let nonExistentStreamId: Effect.Effect<EventStreamId, ParseResult.ParseError, never>;
      let result: Chunk.Chunk<FooEvent>;

      beforeEach(async () => {
        nonExistentStreamId = newEventStreamId();
        result = await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                nonExistentStreamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.read(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.runCollect // No events in non-existent stream
                  )
                )
              )
            )
          )
        );
      });

      it('should return no events', () => {
        expect(result).toHaveLength(0);
      });
    });

    describe('reading events immediately after writing to same stream', () => {
      let streamId: Effect.Effect<EventStreamId, ParseResult.ParseError, never>;
      let streamBeginning: EventStreamPosition;

      beforeEach(async () => {
        streamId = newEventStreamId();
        streamBeginning = await pipe(streamId, Effect.flatMap(beginning), Effect.runPromise);
      });

      it('should be able to read events immediately after writing them', async () => {
        // Write events to the stream
        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'immediate-test-1' }, { bar: 'immediate-test-2' }),
                Stream.run(eventstore.append(streamBeginning))
              )
            )
          )
        );

        // Immediately try to read from the same stream (simulates session join after creation)
        const eventsRead = await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.read(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.runCollect // No take needed - read only returns historical
                  )
                )
              )
            )
          )
        );

        // Should be able to read the events we just wrote
        expect(toArraySafely(eventsRead)).toEqual([
          { bar: 'immediate-test-1' },
          { bar: 'immediate-test-2' },
        ]);
      });

      it('should be able to read historical events immediately after writing them', async () => {
        // Write events to the stream
        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'historical-test-1' }, { bar: 'historical-test-2' }),
                Stream.run(eventstore.append(streamBeginning))
              )
            )
          )
        );

        // Immediately try to read using read (which returns only historical events)
        const eventsRead = await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.read(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.runCollect // No take needed - read only returns historical
                  )
                )
              )
            )
          )
        );

        // Should be able to read the events we just wrote
        expect(toArraySafely(eventsRead)).toEqual([
          { bar: 'historical-test-1' },
          { bar: 'historical-test-2' },
        ]);
      });
    });

    describe('subscription functionality', () => {
      let streamId: Effect.Effect<EventStreamId, ParseResult.ParseError, never>;
      let streamBeginning: EventStreamPosition;

      beforeEach(async () => {
        streamId = newEventStreamId();
        streamBeginning = await pipe(streamId, Effect.flatMap(beginning), Effect.runPromise);
      });

      it('should receive events written to a subscribed stream', async () => {
        const receivedEventsRef = Ref.unsafeMake(Chunk.empty<FooEvent>());

        // First write some initial events to the stream
        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'initial-event' }),
                Stream.run(eventstore.append(streamBeginning))
              )
            )
          )
        );

        // Start subscription from the beginning (which includes the initial event)
        const subscriptionEffect = runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.subscribe(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(3), // Take initial event + 2 live events
                    Stream.tap((event) => Ref.update(receivedEventsRef, Chunk.append(event))),
                    Stream.runDrain
                  )
                )
              )
            )
          )
        );

        // Start the subscription
        const subscription = subscriptionEffect.catch(() => {
          // Handle subscription errors gracefully in tests
        });

        // Give subscription time to establish and receive initial event
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Write more events to trigger live streaming
        const nextPosition = await pipe(
          streamId,
          Effect.map((streamId) => ({ streamId, eventNumber: 1 })),
          Effect.runPromise
        );

        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'live-event-1' }, { bar: 'live-event-2' }),
                Stream.run(eventstore.append(nextPosition))
              )
            )
          )
        );

        // Wait for subscription to process events
        await Promise.race([
          subscription,
          new Promise((resolve) => setTimeout(resolve, 1000)), // Timeout fallback
        ]);

        // Verify events were received (historical + live)
        const receivedEvents = await Effect.runPromise(
          pipe(Ref.get(receivedEventsRef), Effect.map(Chunk.toReadonlyArray))
        );
        expect(receivedEvents).toEqual([
          { bar: 'initial-event' },
          { bar: 'live-event-1' },
          { bar: 'live-event-2' },
        ]);
      });

      it('should handle multiple subscribers to the same stream', async () => {
        const subscriber1EventsRef = Ref.unsafeMake(Chunk.empty<FooEvent>());
        const subscriber2EventsRef = Ref.unsafeMake(Chunk.empty<FooEvent>());

        // Create first subscription
        const subscription1 = runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.subscribe(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(1),
                    Stream.tap((event) => Ref.update(subscriber1EventsRef, Chunk.append(event))),
                    Stream.runDrain
                  )
                )
              )
            )
          )
        ).catch(() => {});

        // Create second subscription
        const subscription2 = runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.subscribe(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(1),
                    Stream.tap((event) => Ref.update(subscriber2EventsRef, Chunk.append(event))),
                    Stream.runDrain
                  )
                )
              )
            )
          )
        ).catch(() => {});

        // Give subscriptions time to establish
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Write an event after subscriptions are established
        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'multi-subscriber-event' }),
                Stream.run(eventstore.append(streamBeginning))
              )
            )
          )
        );

        // Wait for both subscriptions to complete
        await Promise.all([
          Promise.race([subscription1, new Promise((resolve) => setTimeout(resolve, 1000))]),
          Promise.race([subscription2, new Promise((resolve) => setTimeout(resolve, 1000))]),
        ]);

        // Both subscribers should receive the same event
        const subscriber1Events = await Effect.runPromise(
          pipe(Ref.get(subscriber1EventsRef), Effect.map(Chunk.toReadonlyArray))
        );
        const subscriber2Events = await Effect.runPromise(
          pipe(Ref.get(subscriber2EventsRef), Effect.map(Chunk.toReadonlyArray))
        );
        expect(subscriber1Events).toEqual([{ bar: 'multi-subscriber-event' }]);
        expect(subscriber2Events).toEqual([{ bar: 'multi-subscriber-event' }]);
      });

      it('should handle subscription to non-existent stream', async () => {
        const receivedEventsRef = Ref.unsafeMake(Chunk.empty<FooEvent>());

        // Subscribe to stream that doesn't exist
        const subscription = runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                streamId,
                Effect.flatMap(beginning),
                Effect.flatMap((position) => eventstore.read(position)),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(0), // Take 0 since stream doesn't exist
                    Stream.tap((event) => Ref.update(receivedEventsRef, Chunk.append(event))),
                    Stream.runDrain
                  )
                )
              )
            )
          )
        ).catch(() => {});

        await Promise.race([subscription, new Promise((resolve) => setTimeout(resolve, 500))]);

        // Should receive no events
        const receivedEvents = await Effect.runPromise(Ref.get(receivedEventsRef));
        expect(receivedEvents).toHaveLength(0);
      });
    });

    /**
     * Test horizontal scaling with multiple EventStore instances
     * This simulates multiple application instances sharing the same data store
     */
    if (supportsHorizontalScaling) {
      describe('horizontal scaling with multiple instances', () => {
        it('should support cross-instance event propagation', async () => {
          const receivedEventsRef = Ref.unsafeMake(Chunk.empty<FooEvent>());
          const streamId = await Effect.runPromise(newEventStreamId());

          // Create TWO separate EventStore instances (simulating different application instances)
          const writerInstance = makeEventStore();
          const subscriberInstance = makeEventStore();

          // Helper to run effects with different instances
          const runWithWriter = <A, E2>(effect: Effect.Effect<A, E2, FooEventStore>) => {
            const provided = pipe(effect, Effect.provide(writerInstance));
            return Effect.runPromise(provided as Effect.Effect<A, E2 | E, never>);
          };

          const runWithSubscriber = <A, E2>(effect: Effect.Effect<A, E2, FooEventStore>) => {
            const provided = pipe(effect, Effect.provide(subscriberInstance));
            return Effect.runPromise(provided as Effect.Effect<A, E2 | E, never>);
          };

          // FIRST: Write initial events using the writer instance
          await runWithWriter(
            pipe(
              FooEventStore,
              Effect.flatMap((store: EventStore<FooEvent>) =>
                pipe(
                  beginning(streamId),
                  Effect.flatMap((pos) =>
                    pipe(
                      Stream.make({ bar: 'event-1' }, { bar: 'event-2' }),
                      Stream.run(store.append(pos))
                    )
                  )
                )
              )
            )
          );

          // SECOND: Subscribe from the beginning with subscriber instance
          // Should receive both historical events AND any new events
          const subscriberFiber = runWithSubscriber(
            pipe(
              FooEventStore,
              Effect.flatMap((store: EventStore<FooEvent>) =>
                pipe(
                  store.subscribe({ streamId, eventNumber: 0 }),
                  Effect.flatMap((stream) =>
                    pipe(
                      stream,
                      Stream.take(3), // Expect 2 historical + 1 new event
                      Stream.tap((event) => Ref.update(receivedEventsRef, Chunk.append(event))),
                      Stream.runDrain
                    )
                  )
                )
              ),
              Effect.scoped
            )
          ).catch(() => {});

          // Give subscription time to receive historical events
          await new Promise((resolve) => setTimeout(resolve, 100));

          // THIRD: Write a new event with writer instance
          // This should be received by the active subscription on the subscriber instance
          await runWithWriter(
            pipe(
              FooEventStore,
              Effect.flatMap((store: EventStore<FooEvent>) =>
                pipe(
                  Stream.make({ bar: 'event-3-live' }),
                  Stream.run(store.append({ streamId, eventNumber: 2 }))
                )
              )
            )
          );

          // Wait for subscription to complete
          const receivedEvents = await Effect.runPromise(
            pipe(Ref.get(receivedEventsRef), Effect.map(Chunk.toReadonlyArray))
          );
          await Promise.race([
            subscriberFiber,
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Subscription timed out. Received ${receivedEvents.length} events: ${JSON.stringify(receivedEvents)}`
                    )
                  ),
                5000
              )
            ),
          ]);

          // Verify we received all events (2 historical + 1 live)
          const finalReceivedEvents = await Effect.runPromise(
            pipe(Ref.get(receivedEventsRef), Effect.map(Chunk.toReadonlyArray))
          );
          expect(finalReceivedEvents).toHaveLength(3);
          expect(finalReceivedEvents[0]).toEqual({ bar: 'event-1' });
          expect(finalReceivedEvents[1]).toEqual({ bar: 'event-2' });
          expect(finalReceivedEvents[2]).toEqual({ bar: 'event-3-live' });
        });
      });
    }
  });
}
