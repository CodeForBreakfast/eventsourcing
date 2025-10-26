# subscribeAll() Design

**Date:** 2025-10-25
**Issue:** hp-8

## Purpose

Add `subscribeAll()` method to EventStore interface for live, cross-stream event subscriptions. Required by EventBus and process managers to receive events from all streams without per-stream subscriptions.

## Interface Design

### Type Signature

```typescript
export interface EventStore<TEvent> {
  // ... existing methods (append, read, subscribe) ...

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

### Design Decisions

- **No parameters:** Subscribes to all streams unconditionally
- **Returns Effect<Stream>:** Consistent with existing `subscribe()` pattern
- **Live-only:** No historical replay, no global event ordering
- **Position included:** Each event carries `EventStreamPosition` (streamId + eventNumber)
- **Type safety:** `EventStore<TEvent>` parameterization ensures compile-time type safety
- **Error handling:** EventStoreError for subscription failures, ParseResult.ParseError for deserialization

## Implementation Strategy

### Postgres Store

**Approach:** Leverage existing NotificationListener infrastructure

- LISTEN/NOTIFY already triggers on all events (migration 0002)
- `subscribeAll()` subscribes to `NotificationListener.notifications` stream
- Filter to only emit events committed AFTER subscription starts (live-only)
- Map notification payloads to `{position, event}` format
- Zero additional database overhead

### InMemory Store

**Approach:** Internal PubSub for event broadcasting

- Add internal `PubSub<{position, event}>` to store
- When `append()` writes events, publish to PubSub
- `subscribeAll()` subscribes to this PubSub
- Simple, clean, no external dependencies
- PubSub naturally handles multiple subscribers

### Filesystem Store

**Approach:** Same PubSub pattern as InMemory

- Add internal `PubSub<{position, event}>` to store
- When `append()` writes files, also publish to PubSub
- `subscribeAll()` subscribes to that PubSub
- Avoids fs.watch() platform inconsistencies
- Reliable, synchronous with writes

**Rationale:** Filesystem store is for testing/local dev (single process). Multi-process scenarios should use Postgres. PubSub keeps implementation simple and consistent.

## Error Handling

### Error Scenarios

| Scenario                                   | Error Type                | Recovery                                   |
| ------------------------------------------ | ------------------------- | ------------------------------------------ |
| Postgres LISTEN/NOTIFY connection drops    | EventStoreError in Stream | Consumer retries subscription              |
| PubSub publish fails (InMemory/Filesystem) | EventStoreError in Stream | Unlikely, but consumer can retry           |
| Event parsing fails                        | ParseResult.ParseError    | Per-event error, doesn't kill subscription |

### Live-only Guarantee

- Each implementation only emits events that occur AFTER `subscribeAll()` is called
- Events committed microseconds before subscription starts won't appear (acceptable)
- No historical replay - consumers use per-stream `subscribe(from)` for that

### Multiple Subscribers

- All implementations support multiple concurrent `subscribeAll()` calls
- Each gets independent stream
- No shared state between subscribers
- PubSub broadcasts to all

### Cleanup

- Stream interruption automatically cleans up resources
- Postgres: unsubscribes from NotificationListener
- InMemory/Filesystem: PubSub subscription cleanup via Effect Scope

## Testing Strategy

### Contract Tests

New file: `packages/eventsourcing-testing-contracts/src/lib/store/subscribeAll.contract.ts`

**Test cases:**

- Events from any stream appear in subscription
- Events committed AFTER subscription start appear (live-only)
- Events committed BEFORE subscription start do NOT appear
- Multiple subscribers each receive events
- Stream interruption cleans up properly
- Parse errors don't kill the subscription

**Pattern:**

```typescript
const testSubscribeAll = <R>(
  store: EventStore<MyEvent>,
  setup: Effect<void, never, R>
) =>
  Effect.gen(function* () {
    yield* setup;

    const stream = yield* store.subscribeAll();
    const events: Array<{position, event}> = [];

    yield* Stream.runForEach(stream, (e) =>
      Effect.sync(() => events.push(e))
    ) |> Effect.fork;

    yield* store.append(...);

    expect(events).toContainEqual(...);
  });
```

### Store-specific Tests

- **Postgres:** Verify NotificationListener integration, LISTEN/NOTIFY working
- **InMemory:** Verify PubSub lifecycle, multiple subscribers
- **Filesystem:** Verify PubSub + file write coordination

## Out of Scope

- Historical replay (use per-stream `subscribe(from)`)
- Global event ordering
- Guaranteed delivery (use external queues for critical workflows)
- Event filtering (consumers do this)

## Success Criteria

- [ ] Interface added to EventStore in eventsourcing-store
- [ ] Postgres implementation using NotificationListener
- [ ] InMemory implementation using PubSub
- [ ] Filesystem implementation using PubSub
- [ ] Contract tests pass for all three stores
- [ ] Unblocks hp-4 (EventBus) and hp-5 (CommandDispatcher)
