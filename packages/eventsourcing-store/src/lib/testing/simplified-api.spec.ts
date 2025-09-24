import { Effect, Stream, pipe, Chunk, Schema, ParseResult, Layer, Fiber } from 'effect';
import { describe, it, expect, beforeEach } from 'bun:test';
import { silentLogger } from '@codeforbreakfast/buntest';
import { EventStreamId, EventStreamPosition, beginning } from '../streamTypes';
import type { EventStore } from '../services';
import { FooEventStore } from './eventstore-test-suite';
import { encodedEventStore } from '../eventstore';
import { makeInMemoryEventStore } from '../inMemory';
import * as InMemoryStore from '../inMemory/InMemoryStore';

const LoggerLive = silentLogger;

const FooEvent = Schema.Struct({
  bar: Schema.String,
  index: Schema.Number,
});
type FooEvent = typeof FooEvent.Type;

const newEventStreamId = () =>
  pipe(`stream_${Math.random().toString(36).substring(7)}`, Schema.decode(EventStreamId));

const FooEventStoreTest = (store: Readonly<InMemoryStore.InMemoryStore<FooEvent>>) =>
  Layer.effect(
    FooEventStore,
    pipe(store, makeInMemoryEventStore, Effect.map(encodedEventStore(FooEvent)))
  );

describe('Simplified EventStore API', () => {
  let streamId: EventStreamId;
  let eventStore: Layer.Layer<FooEventStore, never, never>;

  const runWithStore = <A, E>(effect: Effect.Effect<A, E, FooEventStore>): Promise<A> =>
    pipe(effect, Effect.provide(eventStore), Effect.runPromise);

  beforeEach(async () => {
    streamId = await Effect.runPromise(newEventStreamId());
    const store = await Effect.runPromise(InMemoryStore.make<FooEvent>());
    eventStore = pipe(FooEventStoreTest(store), Layer.provide(LoggerLive));
  });

  describe('read() method - Historical events only', () => {
    it('should return only historical events, no live updates', async () => {
      // Write some initial events
      const startPos = await pipe(streamId, beginning, Effect.runPromise);

      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              Stream.make(
                { bar: 'event1', index: 0 },
                { bar: 'event2', index: 1 },
                { bar: 'event3', index: 2 }
              ),
              Stream.run(store.append(startPos))
            )
          )
        )
      );

      // Read from position 1
      const readPosition: EventStreamPosition = { streamId, eventNumber: 1 };
      const events = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(readPosition)),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      // Should get events 1 and 2 (starting from position 1)
      expect(events).toEqual([
        { bar: 'event2', index: 1 },
        { bar: 'event3', index: 2 },
      ]);

      // Write more events after reading
      const endPos: EventStreamPosition = { streamId, eventNumber: 3 };
      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              Stream.make({ bar: 'event4', index: 3 }, { bar: 'event5', index: 4 }),
              Stream.run(store.append(endPos))
            )
          )
        )
      );

      // Read again from same position - should still only get historical
      const eventsAgain = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(readPosition)),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      // Should now include all historical events from position 1
      expect(eventsAgain).toEqual([
        { bar: 'event2', index: 1 },
        { bar: 'event3', index: 2 },
        { bar: 'event4', index: 3 },
        { bar: 'event5', index: 4 },
      ]);
    });

    it('should return empty stream when reading from future position', async () => {
      const futurePosition: EventStreamPosition = { streamId, eventNumber: 100 };

      const events = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(futurePosition)),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      expect(events).toEqual([]);
    });
  });

  describe('subscribe() method - Historical + Live events', () => {
    it('should return historical events first, then continue with live updates', async () => {
      // Write some initial events
      const startPos = await pipe(streamId, beginning, Effect.runPromise);

      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              Stream.make({ bar: 'historical1', index: 0 }, { bar: 'historical2', index: 1 }),
              Stream.run(store.append(startPos))
            )
          )
        )
      );

      const receivedEvents: FooEvent[] = [];

      // Start subscription from beginning
      const subscribePosition = await pipe(streamId, beginning, Effect.runPromise);

      // Use scoped to handle the subscription properly
      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              // Fork the writing of new events after a delay
              Effect.fork(
                pipe(
                  Effect.sleep('100 millis'),
                  Effect.flatMap(() => {
                    const currentPos: EventStreamPosition = { streamId, eventNumber: 2 };
                    return pipe(
                      Stream.make(
                        { bar: 'live1', index: 2 },
                        { bar: 'live2', index: 3 },
                        { bar: 'live3', index: 4 }
                      ),
                      Stream.run(store.append(currentPos))
                    );
                  })
                )
              ),
              Effect.flatMap(() =>
                // Subscribe and collect events
                pipe(
                  store.subscribe(subscribePosition),
                  Effect.flatMap((stream) =>
                    pipe(
                      stream,
                      Stream.take(5), // Expect 2 historical + 3 new
                      Stream.tap((event) => Effect.sync(() => receivedEvents.push(event))),
                      Stream.runDrain
                    )
                  ),
                  Effect.scoped
                )
              )
            )
          )
        )
      );

      // Should have received historical first, then live events
      expect(receivedEvents).toEqual([
        { bar: 'historical1', index: 0 },
        { bar: 'historical2', index: 1 },
        { bar: 'live1', index: 2 },
        { bar: 'live2', index: 3 },
        { bar: 'live3', index: 4 },
      ]);
    });

    it('should handle subscription from middle of stream', async () => {
      // Write initial events
      const startPos = await pipe(streamId, beginning, Effect.runPromise);

      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              Stream.make(
                { bar: 'event0', index: 0 },
                { bar: 'event1', index: 1 },
                { bar: 'event2', index: 2 }
              ),
              Stream.run(store.append(startPos))
            )
          )
        )
      );

      const receivedEvents: FooEvent[] = [];

      // Subscribe from position 1 (skip first event)
      const subscribePosition: EventStreamPosition = { streamId, eventNumber: 1 };

      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              // Fork writing new events after a delay
              Effect.fork(
                pipe(
                  Effect.sleep('100 millis'),
                  Effect.flatMap(() => {
                    const currentPos: EventStreamPosition = { streamId, eventNumber: 3 };
                    return pipe(
                      Stream.make({ bar: 'new1', index: 3 }, { bar: 'new2', index: 4 }),
                      Stream.run(store.append(currentPos))
                    );
                  })
                )
              ),
              Effect.flatMap(() =>
                // Subscribe and collect events
                pipe(
                  store.subscribe(subscribePosition),
                  Effect.flatMap((stream) =>
                    pipe(
                      stream,
                      Stream.take(4), // Expect 2 historical + 2 new
                      Stream.tap((event) => Effect.sync(() => receivedEvents.push(event))),
                      Stream.runDrain
                    )
                  ),
                  Effect.scoped
                )
              )
            )
          )
        )
      );

      expect(receivedEvents).toEqual([
        { bar: 'event1', index: 1 },
        { bar: 'event2', index: 2 },
        { bar: 'new1', index: 3 },
        { bar: 'new2', index: 4 },
      ]);
    });
  });

  describe('Stream combinator examples', () => {
    beforeEach(async () => {
      // Setup test data
      const startPos = await pipe(streamId, beginning, Effect.runPromise);

      await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) =>
            pipe(
              Stream.make(
                { bar: 'a', index: 0 },
                { bar: 'b', index: 1 },
                { bar: 'c', index: 2 },
                { bar: 'd', index: 3 },
                { bar: 'e', index: 4 }
              ),
              Stream.run(store.append(startPos))
            )
          )
        )
      );
    });

    it('should support reading a range using take and drop', async () => {
      const position = await pipe(streamId, beginning, Effect.runPromise);

      const events = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(position)),
          Effect.map((stream) =>
            pipe(
              stream,
              Stream.drop(1), // Skip first event
              Stream.take(3) // Take next 3 events
            )
          ),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      expect(events).toEqual([
        { bar: 'b', index: 1 },
        { bar: 'c', index: 2 },
        { bar: 'd', index: 3 },
      ]);
    });

    it('should support filtering events', async () => {
      const position = await pipe(streamId, beginning, Effect.runPromise);

      const events = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(position)),
          Effect.map((stream) =>
            pipe(
              stream,
              Stream.filter((event) => event.index % 2 === 0) // Only even indices
            )
          ),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      expect(events).toEqual([
        { bar: 'a', index: 0 },
        { bar: 'c', index: 2 },
        { bar: 'e', index: 4 },
      ]);
    });

    it('should support batching/chunking events', async () => {
      const position = await pipe(streamId, beginning, Effect.runPromise);

      const batches = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(position)),
          Effect.map((stream) =>
            pipe(
              stream,
              Stream.grouped(2) // Group into batches of 2
            )
          ),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray),
          Effect.map((chunks) => chunks.map(Chunk.toReadonlyArray))
        )
      );

      expect(batches).toEqual([
        [
          { bar: 'a', index: 0 },
          { bar: 'b', index: 1 },
        ],
        [
          { bar: 'c', index: 2 },
          { bar: 'd', index: 3 },
        ],
        [{ bar: 'e', index: 4 }],
      ]);
    });

    it('should support reverse order by collecting and reversing', async () => {
      const position = await pipe(streamId, beginning, Effect.runPromise);

      const events = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(position)),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.runCollect,
              Effect.map(Chunk.reverse),
              Effect.map(Chunk.toReadonlyArray)
            )
          )
        )
      );

      expect(events).toEqual([
        { bar: 'e', index: 4 },
        { bar: 'd', index: 3 },
        { bar: 'c', index: 2 },
        { bar: 'b', index: 1 },
        { bar: 'a', index: 0 },
      ]);
    });

    it('should support mapping/transforming events', async () => {
      const position = await pipe(streamId, beginning, Effect.runPromise);

      const transformed = await runWithStore(
        pipe(
          FooEventStore,
          Effect.flatMap((store) => store.read(position)),
          Effect.map((stream) =>
            pipe(
              stream,
              Stream.map((event) => event.bar.toUpperCase()),
              Stream.take(3)
            )
          ),
          Effect.flatMap(Stream.runCollect),
          Effect.map(Chunk.toReadonlyArray)
        )
      );

      expect(transformed).toEqual(['A', 'B', 'C']);
    });
  });
});
