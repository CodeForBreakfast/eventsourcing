---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-filesystem': patch
---

Introduce `StreamEvent<T>` type to consolidate event-with-position pattern

This change introduces a new `StreamEvent<T>` type that represents an event with its stream position metadata. This replaces the verbose `{ readonly position: EventStreamPosition; readonly event: T }` pattern used throughout the codebase.

**What changed:**

- Added `StreamEvent<T>` type and Schema to `@codeforbreakfast/eventsourcing-store`
- Updated `EventStore.subscribeAll()` to return `Stream<StreamEvent<T>>` instead of `Stream<{ position, event }>`
- Refactored internal implementations in postgres, inmemory, and filesystem stores to use the new type
- Removed redundant object mapping in SQL event store subscription

**Migration:**
If you're using `EventStore.subscribeAll()`, you can now use the `StreamEvent<T>` type for better type inference:

```typescript
// Before
type EventWithPos = { readonly position: EventStreamPosition; readonly event: MyEvent };

// After
import { type StreamEvent } from '@codeforbreakfast/eventsourcing-store';
type EventWithPos = StreamEvent<MyEvent>;
```

The change is backward compatible as the structure remains identical.
