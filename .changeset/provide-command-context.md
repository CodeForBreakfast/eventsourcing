---
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-transport-websocket': minor
---

Add `provideCommandInitiator` helper and authentication support for secure command execution. Commands no longer accept userId as a parameter - instead, use `eventMetadata<TInitiator>()` to get metadata from CommandContext. This prevents clients from impersonating other users in client/server scenarios.

**Breaking change for aggregates:** Command signatures have changed. Instead of passing userId/initiator as a parameter, provide it via CommandContext layer using `provideCommandInitiator(userId)`.

**New features:**

- `provideCommandInitiator<TInitiator>(initiator)` - convenient helper to provide CommandContext layer
- `eventMetadata<TInitiator>()` - get event metadata (occurredAt, originator) from CommandContext
- WebSocket transport now supports optional `authenticateConnection` callback for secure authentication
- Authentication metadata flows from connection to ClientConnection.metadata

**Migration example:**

```typescript
// Before
TodoAggregateRoot.commands.createTodo(userId, title)();

// After
pipe(
  TodoAggregateRoot.commands.createTodo(title)(),
  Effect.provide(provideCommandInitiator(userId))
);
```
