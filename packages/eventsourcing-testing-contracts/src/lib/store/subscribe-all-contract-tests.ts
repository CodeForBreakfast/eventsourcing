import { Chunk, Effect, Fiber, Stream, pipe, Schema } from 'effect';
import { describe, expect, it } from 'bun:test';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';

const makeStreamId = (id: string) => Schema.decode(EventStreamId)(id);

/**
 * Contract tests for EventStore.subscribeAll()
 * All implementations must pass these tests
 */
export const subscribeAllContract = (
  storeName: string,
  makeStore: Effect.Effect<EventStore<string>, never, never>
) => {
  describe(`${storeName} - subscribeAll() contract`, () => {
    it('should receive events from multiple streams', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;
        const streamId1 = yield* makeStreamId('stream-1');
        const streamId2 = yield* makeStreamId('stream-2');

        // Start subscription (take 4 events then complete)
        const stream = yield* store.subscribeAll();

        // Collect events in background
        const fiber = yield* pipe(stream, Stream.take(4), Stream.runCollect, Effect.fork);

        // Give subscription time to initialize
        yield* Effect.sleep('100 millis');

        // Append events to different streams
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: streamId1, eventNumber: 0 }))
        );

        yield* pipe(
          Stream.make('event3', 'event4'),
          Stream.run(store.append({ streamId: streamId2, eventNumber: 0 }))
        );

        // Wait for fiber to collect all events
        const chunk = yield* Fiber.join(fiber);
        const events = Chunk.toReadonlyArray(chunk);

        // Verify events from both streams appeared
        expect(events.length).toBe(4);
        expect(events.map((e) => e.event)).toEqual(['event1', 'event2', 'event3', 'event4']);
        expect(events.map((e) => e.position.streamId)).toContain(streamId1);
        expect(events.map((e) => e.position.streamId)).toContain(streamId2);
      }).pipe(Effect.runPromise));

    it('should only receive events committed AFTER subscription starts (live-only)', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;
        const streamId1 = yield* makeStreamId('stream-1');
        const streamId2 = yield* makeStreamId('stream-2');

        // Append events BEFORE subscription
        yield* pipe(
          Stream.make('old-event-1', 'old-event-2'),
          Stream.run(store.append({ streamId: streamId1, eventNumber: 0 }))
        );

        // Start subscription (take 2 events)
        const stream = yield* store.subscribeAll();

        const fiber = yield* pipe(stream, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append events AFTER subscription
        yield* pipe(
          Stream.make('new-event-1', 'new-event-2'),
          Stream.run(store.append({ streamId: streamId2, eventNumber: 0 }))
        );

        const chunk = yield* Fiber.join(fiber);
        const events = Chunk.toReadonlyArray(chunk);

        // Should only see new events, not old ones
        expect(events.length).toBe(2);
        expect(events.map((e) => e.event)).toEqual(['new-event-1', 'new-event-2']);
        expect(events.map((e) => e.event)).not.toContain('old-event-1');
        expect(events.map((e) => e.event)).not.toContain('old-event-2');
      }).pipe(Effect.runPromise));

    it('should support multiple concurrent subscribers', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;
        const streamId1 = yield* makeStreamId('stream-1');

        // Start two subscriptions
        const stream1 = yield* store.subscribeAll();
        const stream2 = yield* store.subscribeAll();

        const fiber1 = yield* pipe(stream1, Stream.take(2), Stream.runCollect, Effect.fork);

        const fiber2 = yield* pipe(stream2, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append events
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: streamId1, eventNumber: 0 }))
        );

        const chunk1 = yield* Fiber.join(fiber1);
        const chunk2 = yield* Fiber.join(fiber2);

        const events1 = Chunk.toReadonlyArray(chunk1).map((e) => e.event);
        const events2 = Chunk.toReadonlyArray(chunk2).map((e) => e.event);

        // Both subscribers should receive all events
        expect(events1).toEqual(['event1', 'event2']);
        expect(events2).toEqual(['event1', 'event2']);
      }).pipe(Effect.runPromise));

    it('should clean up properly when subscription is interrupted', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;
        const streamId1 = yield* makeStreamId('stream-1');

        const stream = yield* store.subscribeAll();

        const fiber = yield* pipe(stream, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append some events
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: streamId1, eventNumber: 0 }))
        );

        const chunk = yield* Fiber.join(fiber);
        const events = Chunk.toReadonlyArray(chunk).map((e) => e.event);

        // Append more events after fiber completes (subscription ended)
        yield* pipe(
          Stream.make('event3', 'event4'),
          Stream.run(store.append({ streamId: streamId1, eventNumber: 2 }))
        );

        yield* Effect.sleep('100 millis');

        // Should only have events before interruption
        expect(events).toEqual(['event1', 'event2']);
        expect(events).not.toContain('event3');
        expect(events).not.toContain('event4');
      }).pipe(Effect.runPromise));
  });
};
