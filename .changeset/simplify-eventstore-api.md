---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
---

Simplified EventStore API to have just two core methods for reading events

## Breaking Changes

The EventStore interface has been simplified to provide a cleaner, more intuitive API:

### Before

```typescript
interface EventStore<TEvent> {
  write(to: EventStreamPosition): Sink<...>
  read(params: ReadParams | EventStreamPosition): Effect<Stream<...>>
  readHistorical(params: ReadParams | EventStreamPosition): Effect<Stream<...>>
}
```

### After

```typescript
interface EventStore<TEvent> {
  write(to: EventStreamPosition): Sink<...>
  read(from: EventStreamPosition): Effect<Stream<...>>    // Historical events only
  subscribe(from: EventStreamPosition): Effect<Stream<...>> // Historical + live events
}
```

### Key Changes

1. **`read` method** - Now returns only historical events (no live updates)
2. **`subscribe` method** - New method that returns historical events followed by live updates
3. **Removed `readHistorical`** - Use `read` instead for historical-only access
4. **Removed `ReadParams`** - Use Stream combinators for advanced operations

### Migration Guide

#### Reading historical events only

```typescript
// Before
eventStore.readHistorical(position);
// After
eventStore.read(position);
```

#### Getting live updates

```typescript
// Before
eventStore.read(position); // Would include live updates
// After
eventStore.subscribe(position); // Explicitly subscribe for live updates
```

#### Advanced operations (filtering, pagination, reverse order)

```typescript
// Before - using ReadParams
eventStore.read({
  streamId,
  fromEventNumber: 10,
  toEventNumber: 20,
  direction: 'backward',
  batchSize: 5,
});

// After - using Stream combinators
pipe(
  eventStore.read(position),
  Effect.map((stream) =>
    pipe(
      stream,
      Stream.drop(10),
      Stream.take(11),
      Stream.grouped(5),
      // For reverse order, collect and reverse
      Stream.runCollect,
      Effect.map(Chunk.reverse)
    )
  )
);
```

### Benefits

- **Clearer intent** - Explicit separation between reading historical data and subscribing to updates
- **Simpler API** - Only 3 methods instead of complex parameter objects
- **Better composability** - Leverage Effect's Stream combinators for advanced operations
- **Type safety** - No more union types for parameters, clearer type signatures

### Deprecated Types

The following types are deprecated and will be removed in a future version:

- `ReadParams`
- `ReadOptions`

Continue using Stream combinators from Effect for operations like filtering, batching, and reversing.
