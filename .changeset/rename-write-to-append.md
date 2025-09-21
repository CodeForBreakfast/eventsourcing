---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-aggregates': minor
---

Rename EventStore `write` method to `append` for better semantic clarity

The `write` method on the EventStore interface has been renamed to `append` to more accurately reflect its purpose - events can only be appended to the end of a stream, not written arbitrarily. The method signature and behavior remain the same, with the position parameter used for optimistic concurrency control to detect conflicts.

### Breaking Changes

- `EventStore.write()` is now `EventStore.append()`
- All implementations and usages have been updated accordingly

### Migration Guide

Update all calls from:

```typescript
eventStore.write(position);
```

To:

```typescript
eventStore.append(position);
```
