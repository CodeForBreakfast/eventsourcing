---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-projections': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
---

feat!: Simplify EventStore API to just read and subscribe methods

## Breaking Changes

### EventStore Interface Simplified

The EventStore interface now has just three methods:

- `write`: Write events to a stream
- `read`: Read historical events only (no live updates)
- `subscribe`: Read historical events then continue with live updates

### Removed APIs

- **Removed `readHistorical` method** - Use `read` instead (it now returns only historical events)
- **Removed `ReadParams` and `ReadOptions` types** - Use EventStreamPosition with Stream combinators
- **Removed complex parameter overloading** - Methods now have single, clear parameter types

## Migration Guide

### Reading Historical Events

```typescript
// Before
eventStore.readHistorical({ streamId, eventNumber });

// After
eventStore.read({ streamId, eventNumber });
```

### Advanced Operations with Stream Combinators

```typescript
// Reading a range (before)
eventStore.read({
  streamId,
  fromEventNumber: 50,
  toEventNumber: 100,
});

// Reading a range (after)
eventStore.read({ streamId, eventNumber: 50 }).pipe(
  Effect.map(Stream.take(51)) // take events 50-100
);

// Reading in reverse (before)
eventStore.read({ streamId, direction: 'backward' });

// Reading in reverse (after)
eventStore
  .read({ streamId, eventNumber: 0 })
  .pipe(
    Effect.map(flow(Stream.runCollect, Effect.map(Chunk.reverse), Effect.flatMap(Stream.fromChunk)))
  );
```

## Benefits

- **Clearer API**: Explicit separation between historical reads and live subscriptions
- **Simpler types**: No complex union types or parameter overloading
- **Better composability**: Leverage Effect's powerful Stream combinators
- **Smaller API surface**: Fewer methods to understand and maintain

## Notes

This change removes theoretical optimizations that were never implemented (like database-level filtering for ranges). These can be added back as specialized methods if performance requirements demand it in the future.
