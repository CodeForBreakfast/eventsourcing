---
'@codeforbreakfast/eventsourcing-server': minor
---

Add EventBus implementation for cross-stream event distribution

This change introduces a new EventBus component that provides a centralized mechanism for distributing events from the event store to multiple independent subscribers. The EventBus subscribes to all events via `EventStore.subscribeAll()` and broadcasts them to registered consumers.

**What changed:**

- Added `EventBus` interface with `subscribe()` method
- Implemented `makeEventBus()` factory function that creates a Layer providing EventBus
- EventBus internally manages a single `subscribeAll()` subscription and broadcasts to multiple consumers
- Each subscriber receives an independent `Stream.Stream<StreamEvent<T>, EventStoreError>`
- Subscriptions are properly cleaned up when their scopes close

**Use cases:**

The EventBus is ideal for scenarios where you need multiple independent components to react to the same stream of events without each creating their own expensive `subscribeAll()` subscription:

- Multiple projection builders processing the same event stream
- Real-time event notification systems
- Event monitoring and logging systems
- Analytics or audit trail processors

**Usage:**

```typescript
import { EventBus, makeEventBus } from '@codeforbreakfast/eventsourcing-server';

// Create and provide the EventBus layer
const EventBusLive = makeEventBus<MyEvent>();

const program = Effect.gen(function* () {
  const eventBus = yield* EventBus;

  // Subscribe to all events
  const eventStream = yield* eventBus.subscribe();

  // Process events
  yield* Stream.runForEach(eventStream, (streamEvent) =>
    Console.log(`Received event: ${streamEvent.event.type}`)
  );
}).pipe(Effect.provide(EventBusLive), Effect.provide(EventStoreLive));
```

**Technical notes:**

- The EventBus creates a single internal `subscribeAll()` subscription on first subscriber
- Events are broadcast to all active subscribers via a PubSub hub
- Clean shutdown is handled via Effect's scoped resource management
- The implementation is transport-agnostic and works with any EventStore implementation
