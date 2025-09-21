import { Effect, pipe, Schema, Layer, Stream } from 'effect';
import { describe, expect, it } from 'bun:test';
import { EventStreamId, EventStreamPosition } from './streamTypes';
import type { EventStore } from './services';
import * as InMemoryStore from './inMemory/InMemoryStore';
import { makeInMemoryEventStore } from './inMemory/inMemoryEventStore';

// Test event schema
const TestEvent = Schema.Struct({
  type: Schema.Literal('TestEvent'),
  value: Schema.String,
});

type TestEvent = Schema.Schema.Type<typeof TestEvent>;

// Create a typed EventStore service tag for tests
class TestEventStoreService extends Effect.Tag('TestEventStore')<
  TestEventStoreService,
  EventStore<TestEvent>
>() {}

// Sample event for testing
const createTestEvent = (value: string): TestEvent => ({
  type: 'TestEvent',
  value,
});

describe('EventStore Unified Read API', () => {
  // Helper to create test event store layer
  const createTestEventStoreLayer = () =>
    Layer.effect(
      TestEventStoreService,
      pipe(
        InMemoryStore.make<TestEvent>(),
        Effect.flatMap(makeInMemoryEventStore),
        Effect.map((store) => store as unknown as EventStore<TestEvent>)
      )
    );

  describe('flexible read API', () => {
    it('should read all events forward when no options provided', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read without options (should default to forward from beginning)
            const readEvents: TestEvent[] = [];
            yield* pipe(
              store.read({ streamId }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      readEvents.push(event);
                    })
                  )
                )
              )
            );

            expect(readEvents).toHaveLength(3);
            expect(readEvents[0]?.value).toBe('first');
            expect(readEvents[1]?.value).toBe('second');
            expect(readEvents[2]?.value).toBe('third');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });

    it('should read events from a specific event number', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read from event number 1 (should skip the first event)
            const readEvents: TestEvent[] = [];
            yield* pipe(
              store.read({ streamId, fromEventNumber: 1 }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      readEvents.push(event);
                    })
                  )
                )
              )
            );

            expect(readEvents).toHaveLength(2);
            expect(readEvents[0]?.value).toBe('second');
            expect(readEvents[1]?.value).toBe('third');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });

    it('should read events up to a specific event number', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
              createTestEvent('fourth'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read up to event number 2 (inclusive)
            const readEvents: TestEvent[] = [];
            yield* pipe(
              store.read({ streamId, toEventNumber: 2 }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      readEvents.push(event);
                    })
                  )
                )
              )
            );

            expect(readEvents).toHaveLength(3);
            expect(readEvents[0]?.value).toBe('first');
            expect(readEvents[1]?.value).toBe('second');
            expect(readEvents[2]?.value).toBe('third');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });

    it('should read events in an event number range', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
              createTestEvent('fourth'),
              createTestEvent('fifth'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read from event number 1 to 3 (inclusive)
            const readEvents: TestEvent[] = [];
            yield* pipe(
              store.read({ streamId, fromEventNumber: 1, toEventNumber: 3 }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      readEvents.push(event);
                    })
                  )
                )
              )
            );

            expect(readEvents).toHaveLength(3);
            expect(readEvents[0]?.value).toBe('second');
            expect(readEvents[1]?.value).toBe('third');
            expect(readEvents[2]?.value).toBe('fourth');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });

    it('should read events backward when direction is specified', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
              createTestEvent('fourth'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read backward (should return events in reverse order)
            const readEvents: TestEvent[] = [];
            yield* pipe(
              store.read({ streamId, direction: 'backward' }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      readEvents.push(event);
                    })
                  )
                )
              )
            );

            expect(readEvents).toHaveLength(4);
            expect(readEvents[0]?.value).toBe('fourth');
            expect(readEvents[1]?.value).toBe('third');
            expect(readEvents[2]?.value).toBe('second');
            expect(readEvents[3]?.value).toBe('first');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });

    it('should respect batch size when specified', async () => {
      await Effect.runPromise(
        pipe(
          Effect.gen(function* () {
            const store = yield* TestEventStoreService;
            const streamId = 'test-stream' as EventStreamId;

            // Write some test events
            const startPos = {
              streamId,
              eventNumber: 0,
            } as EventStreamPosition;
            const events = [
              createTestEvent('first'),
              createTestEvent('second'),
              createTestEvent('third'),
              createTestEvent('fourth'),
              createTestEvent('fifth'),
              createTestEvent('sixth'),
            ];

            yield* pipe(Stream.fromIterable(events), Stream.run(store.write(startPos)));

            // Read with batch size of 2
            const batches: TestEvent[][] = [];
            let currentBatch: TestEvent[] = [];

            yield* pipe(
              store.read({ streamId, batchSize: 2 }),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.runForEach((event) =>
                    Effect.sync(() => {
                      currentBatch.push(event);
                      if (currentBatch.length === 2) {
                        batches.push([...currentBatch]);
                        currentBatch = [];
                      }
                    })
                  )
                )
              )
            );

            // Add any remaining events as a final batch
            if (currentBatch.length > 0) {
              batches.push(currentBatch);
            }

            // Should have 3 batches of 2 events each
            expect(batches).toHaveLength(3);
            expect(batches[0]).toHaveLength(2);
            expect(batches[0]?.[0]?.value).toBe('first');
            expect(batches[0]?.[1]?.value).toBe('second');
            expect(batches[1]).toHaveLength(2);
            expect(batches[1]?.[0]?.value).toBe('third');
            expect(batches[1]?.[1]?.value).toBe('fourth');
            expect(batches[2]).toHaveLength(2);
            expect(batches[2]?.[0]?.value).toBe('fifth');
            expect(batches[2]?.[1]?.value).toBe('sixth');
          }),
          Effect.provide(createTestEventStoreLayer())
        )
      );
    });
  });
});
