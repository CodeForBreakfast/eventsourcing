---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-projections': minor
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-websocket-transport': minor
---

## Breaking Changes: API Standardization and Service Pattern Improvements

### Service Definition Patterns

- **BREAKING**: Renamed `EventStoreServiceInterface` to `EventStore` for cleaner naming
- **BREAKING**: Renamed `ProjectionStoreServiceInterface` to `ProjectionStore`
- **BREAKING**: Renamed `SnapshotStoreServiceInterface` to `SnapshotStore`
- Updated `CommandContext` and `CurrentUser` services to use `Effect.Tag` pattern with proper interfaces
- Removed deprecated `EventStore<TEvent>` interface (was already marked deprecated)

### Documentation Improvements

- Added comprehensive JSDoc documentation to core APIs
- Added examples showing pipe composition patterns with currying
- Documented error types with `@throws` tags
- Added `@since` tags for version tracking

### Type Safety Enhancements

- Fixed service tag patterns for better type inference
- Standardized generic parameter ordering across all packages

### Migration Guide

Update your imports:

```typescript
// Before
import type { EventStoreServiceInterface } from '@codeforbreakfast/eventsourcing-store';

// After
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
```

Update service definitions:

```typescript
// Before
class MyEventStore extends Effect.Tag('MyEventStore')<
  MyEventStore,
  EventStoreServiceInterface<MyEvent>
>() {}

// After
class MyEventStore extends Effect.Tag('MyEventStore')<MyEventStore, EventStore<MyEvent>>() {}
```
