# @codeforbreakfast/eventsourcing-server

Server-side building blocks for event sourcing applications.

## Components

### EventBus

Live cross-stream event distribution for process managers and projections.

**Usage:**

```typescript
import { EventBus, EventBusLive } from '@codeforbreakfast/eventsourcing-server';
import { encodedEventStore } from '@codeforbreakfast/eventsourcing-store';

// Wrap raw EventStore with schema
const typedStore = encodedEventStore(MyEventSchema)(rawStore);

// Create EventBus layer
const eventBusLayer = EventBusLive({ store: MyEventStoreTag });

// Subscribe to filtered events
const program = Effect.gen(function* () {
  const eventBus = yield* EventBus;

  const stream = yield* eventBus.subscribe(
    (event): event is TodoCreated => event._tag === 'TodoCreated'
  );

  yield* Stream.runForEach(stream, ({ position, event }) =>
    Console.log(`Event at ${position.streamId}:${position.eventNumber}`, event)
  );
});
```

**Properties:**

- Live-only (no historical events)
- Best-effort delivery
- Works across server instances
- Type-safe filtering

## Future Components

- CommandDispatcher (hp-5)
- StoreSubscriptionManager (hp-6)
- ProtocolBridge
