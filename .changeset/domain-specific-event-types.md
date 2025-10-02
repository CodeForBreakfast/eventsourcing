---
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-store': minor
---

Enforce domain-specific event types throughout the command processing layer. Command handlers and routers are now generic over your domain event types, preventing accidental use of generic `Event` types with `unknown` data in domain code.

**Breaking Changes:**

- `CommandHandler` and `CommandRouter` are now generic interfaces that require a type parameter
- `createCommandProcessingService` now requires an event store tag parameter before the router parameter
- Factory functions with default type parameters have been removed from service tag creation

**Migration:**

Before:

```typescript
const handler: CommandHandler = {
  execute: () => Effect.succeed([{ type: 'Created', data: {...} } as Event])
};

const service = createCommandProcessingService(router);
```

After:

```typescript
// 1. Define domain events
const MyEvent = Schema.Union(Created, Updated);
type MyEvent = typeof MyEvent.Type;

// 2. Create domain-specific event store tag
const MyEventStore = Context.GenericTag<EventStore<MyEvent>, EventStore<MyEvent>>('MyEventStore');

// 3. Use typed handlers
const handler: CommandHandler<MyEvent> = {
  execute: () => Effect.succeed([{ type: 'Created', data: {...} }])
};

// 4. Provide event store tag to factory
const service = createCommandProcessingService(MyEventStore)(router);
```

The generic `Event` type remains available for serialization boundaries (storage implementations, wire protocol) but should not be used in domain logic.

See ARCHITECTURE.md for detailed design rationale and migration guidance.
