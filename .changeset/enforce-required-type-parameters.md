---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-commands': minor
---

**BREAKING CHANGE**: Remove factory functions with default type parameters to enforce explicit type specification

Factory functions that previously allowed default `unknown` type parameters have been removed. You must now create service tags directly using `Context.GenericTag` with explicit types.

**Migration guide:**

Before:

```typescript
const EventStoreService = EventStore<UserEvent>();
const ProjectionStoreService = ProjectionStore<UserProjection>();
```

After:

```typescript
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
const UserProjectionStore = Context.GenericTag<
  ProjectionStore<UserProjection>,
  ProjectionStore<UserProjection>
>('UserProjectionStore');
```

This change enforces domain-specific types throughout your codebase, preventing accidental use of `unknown` types in domain code while keeping generic types only at serialization boundaries.

**What's changed:**

- Removed `EventStore()`, `ProjectionStore()`, and `SnapshotStore()` factory functions
- Removed `StreamHandler()` and `StreamHandlerLive()` factory functions
- Removed default type parameter from `DomainCommand<TPayload>` interface
- Updated documentation to reflect the new pattern
