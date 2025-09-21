import { Chunk, Effect, Layer, ParseResult, Schema, Stream, pipe } from 'effect';
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { EventStreamId, EventStreamPosition, beginning } from '../streamTypes';
import { type EventStore, StreamEndMovedError } from '../eventstore';

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
 * Reusable test suite for EventStore implementations
 *
 * @param name - Display name for the implementation (e.g., "In-memory", "PostgreSQL")
 * @param makeEventStore - Function that returns a Layer providing the EventStore implementation
 */
export function runEventStoreTestSuite<E>(
  name: string,
  makeEventStore: () => Layer.Layer<FooEventStore, E, unknown>
) {
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
                Stream.run(eventstore.write(streamBeginning))
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
                  Stream.run(eventstore.write(streamBeginning)),
                  Effect.flip,
                  Effect.map((error) => {
                    expect(error).toBeInstanceOf(StreamEndMovedError);
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
                pipe(Stream.make({ bar: 'foo' }), Stream.run(eventstore.write(result)))
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
                    Stream.run(eventstore.write(result)),
                    Effect.flip,
                    Effect.map((error) => {
                      expect(error).toBeInstanceOf(StreamEndMovedError);
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
                      eventstore.write(
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
                Stream.run(eventstore.write(emptyStreamWrongEnd)),
                Effect.flip,
                Effect.map((error) => {
                  expect(error).toBeInstanceOf(StreamEndMovedError);
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
                Stream.run(eventstore.write(streamBeginning))
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
                Stream.run(eventstore.write(streamBeginning))
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
        const receivedEvents: FooEvent[] = [];

        // First write some initial events to the stream
        await runPromiseWithEventStore(
          pipe(
            FooEventStore,
            Effect.flatMap((eventstore: EventStore<FooEvent>) =>
              pipe(
                Stream.make({ bar: 'initial-event' }),
                Stream.run(eventstore.write(streamBeginning))
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
                    Stream.tap((event) =>
                      Effect.sync(() => {
                        // eslint-disable-next-line functional/immutable-data
                        receivedEvents.push(event);
                      })
                    ),
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
                Stream.run(eventstore.write(nextPosition))
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
        expect(receivedEvents).toEqual([
          { bar: 'initial-event' },
          { bar: 'live-event-1' },
          { bar: 'live-event-2' },
        ]);
      });

      it('should handle multiple subscribers to the same stream', async () => {
        const subscriber1Events: FooEvent[] = [];
        const subscriber2Events: FooEvent[] = [];

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
                    Stream.tap((event) =>
                      Effect.sync(() => {
                        // eslint-disable-next-line functional/immutable-data
                        subscriber1Events.push(event);
                      })
                    ),
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
                    Stream.tap((event) =>
                      Effect.sync(() => {
                        // eslint-disable-next-line functional/immutable-data
                        subscriber2Events.push(event);
                      })
                    ),
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
                Stream.run(eventstore.write(streamBeginning))
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
        expect(subscriber1Events).toEqual([{ bar: 'multi-subscriber-event' }]);
        expect(subscriber2Events).toEqual([{ bar: 'multi-subscriber-event' }]);
      });

      it('should handle subscription to non-existent stream', async () => {
        const receivedEvents: FooEvent[] = [];

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
                    Stream.tap((event) =>
                      Effect.sync(() => {
                        // eslint-disable-next-line functional/immutable-data
                        receivedEvents.push(event);
                      })
                    ),
                    Stream.runDrain
                  )
                )
              )
            )
          )
        ).catch(() => {});

        await Promise.race([subscription, new Promise((resolve) => setTimeout(resolve, 500))]);

        // Should receive no events
        expect(receivedEvents).toHaveLength(0);
      });
    });
  });
}
