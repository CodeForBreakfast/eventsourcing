# subscribeAll() Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `subscribeAll()` method to EventStore interface for live, cross-stream event subscriptions, implemented across all three store types (Postgres, InMemory, Filesystem).

**Architecture:** Add method to EventStore interface that returns `Effect<Stream<{position, event}>>`. Postgres leverages existing NotificationListener. InMemory and Filesystem use internal PubSub that gets published to on append.

**Tech Stack:** Effect, TypeScript, Postgres LISTEN/NOTIFY, PubSub

---

## Task 1: Add subscribeAll() to EventStore Interface

**Files:**

- Modify: `packages/eventsourcing-store/src/lib/services.ts:11-55`

**Step 1: Add subscribeAll() method to EventStore interface**

In `packages/eventsourcing-store/src/lib/services.ts`, add the new method after the `subscribe` method:

```typescript
export interface EventStore<TEvent> {
  // ... existing append, read, subscribe methods ...

  /**
   * Subscribe to live events from ALL streams
   * Returns only new events committed after subscription starts (no historical replay)
   * Each event includes its position (streamId + eventNumber)
   *
   * @returns A stream of events from all streams with their positions
   */
  readonly subscribeAll: () => Effect.Effect<
    Stream.Stream<
      { readonly position: EventStreamPosition; readonly event: TEvent },
      ParseResult.ParseError | EventStoreError
    >,
    EventStoreError,
    never
  >;
}
```

**Step 2: Verify TypeScript compilation**

Run: `cd packages/eventsourcing-store && bun run build`
Expected: Build succeeds, but implementations will show type errors (expected - we'll fix those next)

**Step 3: Commit interface change**

```bash
git add packages/eventsourcing-store/src/lib/services.ts
git commit -m "feat(eventsourcing-store): add subscribeAll() to EventStore interface"
```

---

## Task 2: Create Contract Tests for subscribeAll()

**Files:**

- Create: `packages/eventsourcing-testing-contracts/src/lib/store/subscribeAll.contract.ts`
- Modify: `packages/eventsourcing-testing-contracts/src/lib/store/index.ts`

**Step 1: Create subscribeAll contract test file**

Create `packages/eventsourcing-testing-contracts/src/lib/store/subscribeAll.contract.ts`:

```typescript
import { Chunk, Effect, Stream, TestContext, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

/**
 * Contract tests for EventStore.subscribeAll()
 * All implementations must pass these tests
 */
export const subscribeAllContract = <R>(
  storeName: string,
  makeStore: Effect.Effect<EventStore<string>, never, R>
) => {
  describe(`${storeName} - subscribeAll() contract`, () => {
    it('should receive events from multiple streams', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;

        // Start subscription (take 4 events then complete)
        const stream = yield* store.subscribeAll();

        // Collect events in background
        const fiber = yield* pipe(stream, Stream.take(4), Stream.runCollect, Effect.fork);

        // Give subscription time to initialize
        yield* Effect.sleep('100 millis');

        // Append events to different streams
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: 'stream-1' as any, eventNumber: 0 }))
        );

        yield* pipe(
          Stream.make('event3', 'event4'),
          Stream.run(store.append({ streamId: 'stream-2' as any, eventNumber: 0 }))
        );

        // Wait for fiber to collect all events
        const chunk = yield* fiber.join();
        const events = Chunk.toReadonlyArray(chunk);

        // Verify events from both streams appeared
        expect(events.length).toBe(4);
        expect(events.map((e) => e.event)).toEqual(['event1', 'event2', 'event3', 'event4']);
        expect(events.map((e) => e.position.streamId)).toContain('stream-1');
        expect(events.map((e) => e.position.streamId)).toContain('stream-2');
      }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise));

    it('should only receive events committed AFTER subscription starts (live-only)', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;

        // Append events BEFORE subscription
        yield* pipe(
          Stream.make('old-event-1', 'old-event-2'),
          Stream.run(store.append({ streamId: 'stream-1' as any, eventNumber: 0 }))
        );

        // Start subscription (take 2 events)
        const stream = yield* store.subscribeAll();

        const fiber = yield* pipe(stream, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append events AFTER subscription
        yield* pipe(
          Stream.make('new-event-1', 'new-event-2'),
          Stream.run(store.append({ streamId: 'stream-2' as any, eventNumber: 0 }))
        );

        const chunk = yield* fiber.join();
        const events = Chunk.toReadonlyArray(chunk);

        // Should only see new events, not old ones
        expect(events.length).toBe(2);
        expect(events.map((e) => e.event)).toEqual(['new-event-1', 'new-event-2']);
        expect(events.map((e) => e.event)).not.toContain('old-event-1');
        expect(events.map((e) => e.event)).not.toContain('old-event-2');
      }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise));

    it('should support multiple concurrent subscribers', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;

        // Start two subscriptions
        const stream1 = yield* store.subscribeAll();
        const stream2 = yield* store.subscribeAll();

        const fiber1 = yield* pipe(stream1, Stream.take(2), Stream.runCollect, Effect.fork);

        const fiber2 = yield* pipe(stream2, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append events
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: 'stream-1' as any, eventNumber: 0 }))
        );

        const chunk1 = yield* fiber1.join();
        const chunk2 = yield* fiber2.join();

        const events1 = Chunk.toReadonlyArray(chunk1).map((e) => e.event);
        const events2 = Chunk.toReadonlyArray(chunk2).map((e) => e.event);

        // Both subscribers should receive all events
        expect(events1).toEqual(['event1', 'event2']);
        expect(events2).toEqual(['event1', 'event2']);
      }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise));

    it('should clean up properly when subscription is interrupted', () =>
      Effect.gen(function* () {
        const store = yield* makeStore;

        const stream = yield* store.subscribeAll();

        const fiber = yield* pipe(stream, Stream.take(2), Stream.runCollect, Effect.fork);

        yield* Effect.sleep('100 millis');

        // Append some events
        yield* pipe(
          Stream.make('event1', 'event2'),
          Stream.run(store.append({ streamId: 'stream-1' as any, eventNumber: 0 }))
        );

        const chunk = yield* fiber.join();
        const events = Chunk.toReadonlyArray(chunk).map((e) => e.event);

        // Append more events after fiber completes (subscription ended)
        yield* pipe(
          Stream.make('event3', 'event4'),
          Stream.run(store.append({ streamId: 'stream-1' as any, eventNumber: 2 }))
        );

        yield* Effect.sleep('100 millis');

        // Should only have events before interruption
        expect(events).toEqual(['event1', 'event2']);
        expect(events).not.toContain('event3');
        expect(events).not.toContain('event4');
      }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise));
  });
};
```

**Step 2: Export contract from store index**

Add to `packages/eventsourcing-testing-contracts/src/lib/store/index.ts`:

```typescript
export * from './subscribeAll.contract';
```

**Step 3: Verify TypeScript compilation**

Run: `cd packages/eventsourcing-testing-contracts && bun run build`
Expected: Build succeeds

**Step 4: Commit contract tests**

```bash
git add packages/eventsourcing-testing-contracts/
git commit -m "test(eventsourcing-testing-contracts): add subscribeAll() contract tests"
```

---

## Task 3: Implement subscribeAll() in Postgres Store

**Files:**

- Modify: `packages/eventsourcing-store-postgres/src/sqlEventStore.ts`
- Modify: `packages/eventsourcing-store-postgres/src/index.test.ts`

**Step 1: Add subscribeAll implementation to Postgres store**

In `packages/eventsourcing-store-postgres/src/sqlEventStore.ts`, find the `buildSqlEventStore` function (around line 402). Add a helper function before it:

```typescript
/**
 * Subscribe to all events from all streams (live-only)
 * Leverages NotificationListener which broadcasts all events
 */
const subscribeToAllStreams = (
  notificationListener: Readonly<{
    readonly notifications: Stream.Stream<
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
      EventStoreError,
      never
    >;
  }>
) =>
  pipe(
    notificationListener.notifications,
    Stream.map((notification) => ({
      position: {
        streamId: notification.streamId,
        eventNumber: notification.payload.eventNumber,
      } as EventStreamPosition,
      event: notification.payload.eventPayload,
    }))
  );
```

**Step 2: Add subscribeAll to the EventStore object**

In the `buildSqlEventStore` function, find where the EventStore object is created (around line 450). Add `subscribeAll` after `subscribe`:

```typescript
const eventStore: EventStore<string> = {
  append: /* existing */,
  read: /* existing */,
  subscribe: /* existing */,
  subscribeAll: () =>
    Effect.succeed(
      pipe(
        subscribeToAllStreams(notificationListener),
        Stream.mapError(
          eventStoreError.read('*', 'Failed to subscribe to all streams')
        )
      )
    ),
};
```

**Step 3: Run Postgres store tests**

Run: `cd packages/eventsourcing-store-postgres && bun test`
Expected: Tests pass (existing tests still work)

**Step 4: Add contract test to Postgres tests**

In `packages/eventsourcing-store-postgres/src/index.test.ts`, add the contract test at the end:

```typescript
import { subscribeAllContract } from '@codeforbreakfast/eventsourcing-testing-contracts';

// At the end of the file, after existing tests
subscribeAllContract('PostgresEventStore', makeTestStore);
```

**Step 5: Run tests with contract**

Run: `cd packages/eventsourcing-store-postgres && bun test`
Expected: All tests pass including new contract tests

**Step 6: Commit Postgres implementation**

```bash
git add packages/eventsourcing-store-postgres/
git commit -m "feat(eventsourcing-store-postgres): implement subscribeAll() using NotificationListener"
```

---

## Task 4: Implement subscribeAll() in InMemory Store

**Files:**

- Modify: `packages/eventsourcing-store-inmemory/src/lib/inMemoryEventStore.ts`
- Modify: `packages/eventsourcing-store-inmemory/src/lib/inMemoryEventStore.test.ts`

**Step 1: Add PubSub to InMemory store state**

In `packages/eventsourcing-store-inmemory/src/lib/inMemoryEventStore.ts`, find the `State` interface (around line 10). Add `allEventsPubSub` field:

```typescript
import {
  Effect,
  HashMap,
  Layer,
  ParseResult,
  Ref,
  Schema,
  Sink,
  Stream,
  PubSub,
  pipe,
} from 'effect';

interface State {
  readonly streams: HashMap.HashMap<
    EventStreamId,
    readonly { readonly eventNumber: EventNumber; readonly payload: string }[]
  >;
  readonly allEventsPubSub: PubSub.PubSub<{
    readonly position: EventStreamPosition;
    readonly event: string;
  }>;
}
```

**Step 2: Initialize PubSub in make function**

Find the `make` function in the Layer. Update it to create the PubSub:

```typescript
make: Effect.gen(function* () {
  const allEventsPubSub = yield* PubSub.unbounded<{
    readonly position: EventStreamPosition;
    readonly event: string;
  }>();

  const state = yield* Ref.make<State>({
    streams: HashMap.empty(),
    allEventsPubSub,
  });

  // ... rest of implementation
}),
```

**Step 3: Publish to PubSub when events are appended**

Find the `append` implementation in the Sink. After events are added to the stream, publish to PubSub:

```typescript
return Sink.forEach<string, ConcurrencyConflictError | ParseResult.ParseError | EventStoreError>(
  (event) =>
    Effect.gen(function* () {
      const currentState = yield* Ref.get(state);
      const stream = HashMap.get(currentState.streams, to.streamId).pipe(
        Effect.map((s) => s ?? [])
      );

      const events = yield* stream;
      const lastEventNumber = events.length === 0 ? -1 : events[events.length - 1]!.eventNumber;

      if (lastEventNumber !== to.eventNumber - 1) {
        return yield* new ConcurrencyConflictError({
          streamId: to.streamId,
          expected: to.eventNumber,
          actual: lastEventNumber + 1,
        });
      }

      const newEvent = {
        eventNumber: to.eventNumber,
        payload: event,
      };

      const newEvents = [...events, newEvent];

      yield* Ref.update(state, (s) => ({
        ...s,
        streams: HashMap.set(s.streams, to.streamId, newEvents),
      }));

      // Publish to allEventsPubSub
      yield* PubSub.publish(currentState.allEventsPubSub, {
        position: { streamId: to.streamId, eventNumber: to.eventNumber },
        event,
      });

      return {
        streamId: to.streamId,
        eventNumber: to.eventNumber + 1,
      } as EventStreamPosition;
    })
);
```

**Step 4: Implement subscribeAll method**

Add the `subscribeAll` method to the returned EventStore object:

```typescript
const eventStore: EventStore<string> = {
  append: /* existing */,
  read: /* existing */,
  subscribe: /* existing */,
  subscribeAll: () =>
    Effect.gen(function* () {
      const currentState = yield* Ref.get(state);
      return Stream.fromPubSub(currentState.allEventsPubSub);
    }).pipe(
      Effect.mapError(
        eventStoreError.read('*', 'Failed to subscribe to all streams')
      )
    ),
};
```

**Step 5: Run InMemory store tests**

Run: `cd packages/eventsourcing-store-inmemory && bun test`
Expected: Existing tests pass

**Step 6: Add contract test**

In `packages/eventsourcing-store-inmemory/src/lib/inMemoryEventStore.test.ts`, add:

```typescript
import { subscribeAllContract } from '@codeforbreakfast/eventsourcing-testing-contracts';

// At the end of the file
subscribeAllContract('InMemoryEventStore', InMemoryEventStoreLive);
```

**Step 7: Run tests with contract**

Run: `cd packages/eventsourcing-store-inmemory && bun test`
Expected: All tests pass including contract tests

**Step 8: Commit InMemory implementation**

```bash
git add packages/eventsourcing-store-inmemory/
git commit -m "feat(eventsourcing-store-inmemory): implement subscribeAll() using PubSub"
```

---

## Task 5: Implement subscribeAll() in Filesystem Store

**Files:**

- Modify: `packages/eventsourcing-store-filesystem/src/lib/fileSystemEventStore.ts`
- Modify: `packages/eventsourcing-store-filesystem/src/lib/fileSystemEventStore.test.ts`

**Step 1: Add PubSub import and state field**

In `packages/eventsourcing-store-filesystem/src/lib/fileSystemEventStore.ts`, add PubSub to imports and create state interface:

```typescript
import { Effect, Layer, ParseResult, Schema, Sink, Stream, PubSub, Ref, pipe } from 'effect';

interface FileSystemStoreState {
  readonly allEventsPubSub: PubSub.PubSub<{
    readonly position: EventStreamPosition;
    readonly event: string;
  }>;
}
```

**Step 2: Initialize PubSub in Layer**

Find the FileSystemEventStoreLive Layer and add PubSub initialization:

```typescript
export const FileSystemEventStoreLive = (baseDir: string) =>
  Layer.effect(
    FileSystemEventStore,
    Effect.gen(function* () {
      const allEventsPubSub = yield* PubSub.unbounded<{
        readonly position: EventStreamPosition;
        readonly event: string;
      }>();

      const state = yield* Ref.make<FileSystemStoreState>({
        allEventsPubSub,
      });

      // ... rest of implementation
    })
  );
```

**Step 3: Publish to PubSub when appending events**

Find the `append` implementation. After writing the file, publish to PubSub:

```typescript
return Sink.forEach<string, ConcurrencyConflictError | ParseResult.ParseError | EventStoreError>(
  (event) =>
    Effect.gen(function* () {
      // ... existing file write logic ...

      // After successful write, publish to PubSub
      const currentState = yield* Ref.get(state);
      yield* PubSub.publish(currentState.allEventsPubSub, {
        position: { streamId: to.streamId, eventNumber: to.eventNumber },
        event,
      });

      return {
        streamId: to.streamId,
        eventNumber: to.eventNumber + 1,
      } as EventStreamPosition;
    })
);
```

**Step 4: Implement subscribeAll method**

Add `subscribeAll` to the EventStore object:

```typescript
const eventStore: EventStore<string> = {
  append: /* existing */,
  read: /* existing */,
  subscribe: /* existing */,
  subscribeAll: () =>
    Effect.gen(function* () {
      const currentState = yield* Ref.get(state);
      return Stream.fromPubSub(currentState.allEventsPubSub);
    }).pipe(
      Effect.mapError(
        eventStoreError.read('*', 'Failed to subscribe to all streams')
      )
    ),
};
```

**Step 5: Run Filesystem store tests**

Run: `cd packages/eventsourcing-store-filesystem && bun test`
Expected: Existing tests pass

**Step 6: Add contract test**

In `packages/eventsourcing-store-filesystem/src/lib/fileSystemEventStore.test.ts`, add:

```typescript
import { subscribeAllContract } from '@codeforbreakfast/eventsourcing-testing-contracts';

// At the end of the file
subscribeAllContract('FileSystemEventStore', FileSystemEventStoreLive('/tmp/test-fs-store'));
```

**Step 7: Run tests with contract**

Run: `cd packages/eventsourcing-store-filesystem && bun test`
Expected: All tests pass including contract tests

**Step 8: Commit Filesystem implementation**

```bash
git add packages/eventsourcing-store-filesystem/
git commit -m "feat(eventsourcing-store-filesystem): implement subscribeAll() using PubSub"
```

---

## Task 6: Run Full Test Suite

**Step 1: Run all tests across the monorepo**

Run: `turbo test`
Expected: All tests pass across all packages

**Step 2: Run build to ensure no TypeScript errors**

Run: `turbo build`
Expected: Clean build with no errors

**Step 3: Commit if any fixes were needed**

If you had to fix anything, commit those changes:

```bash
git add .
git commit -m "fix: resolve test/build issues"
```

---

## Task 7: Create Changeset

**Files:**

- Create: `.changeset/subscribeall-feature.md`

**Step 1: Create changeset file**

Create `.changeset/subscribeall-feature.md`:

````markdown
---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-store-inmemory': minor
'@codeforbreakfast/eventsourcing-store-filesystem': minor
'@codeforbreakfast/eventsourcing-testing-contracts': minor
---

Add subscribeAll() method to EventStore for live cross-stream event subscriptions

**New Feature:**

All EventStore implementations now support `subscribeAll()`, which provides live event subscriptions across all streams. This is essential for EventBus and process manager implementations.

**Usage:**

```typescript
const store: EventStore<MyEvent> = /* ... */;

const allEventsStream = yield* store.subscribeAll();

yield* Stream.runForEach(allEventsStream, ({ position, event }) => {
  console.log(`Event from ${position.streamId}:`, event);
});
```
````

**Key characteristics:**

- **Live-only**: Only events committed after subscription starts are delivered
- **Cross-stream**: Receives events from all streams
- **Typed**: Each event includes its `EventStreamPosition` (streamId + eventNumber)
- **Best-effort**: No guaranteed delivery or global ordering

**Implementation details:**

- **Postgres**: Uses existing LISTEN/NOTIFY infrastructure
- **InMemory**: Internal PubSub broadcasts events on append
- **Filesystem**: Internal PubSub broadcasts events on file write

**Breaking changes:** None - this is a backward-compatible addition to the EventStore interface.

````

**Step 2: Commit changeset**

```bash
git add .changeset/subscribeall-feature.md
git commit -m "chore: add changeset for subscribeAll() feature"
````

---

## Verification

Run these commands to verify the complete implementation:

```bash
# Full test suite
turbo test

# Full build
turbo build

# Check git status
git status

# View commits
git log --oneline -10
```

Expected results:

- All tests passing
- Clean build
- 8-9 commits on feat/subscribe-all branch
- Ready for PR

---

## Next Steps

1. Push branch: `git push -u origin feat/subscribe-all`
2. Create PR with title: `feat: add subscribeAll() to EventStore for live cross-stream subscriptions`
3. Link to hp-8 in PR description
4. Request review
