# Event Sourcing Server Components Design

**Date:** 2025-10-25
**Status:** Approved
**Context:** Based on learnings from `origin/feat/websocket-example` spike

## Problem

The spike branch proved that building a WebSocket event sourcing server requires significant boilerplate:

- 521 lines of manual command routing and protocol wiring
- 43 lines of custom event bus implementation
- 241 lines of process manager infrastructure

The spike created an `eventsourcing-server` package with working implementations, but analysis revealed critical gaps in the architecture around event store subscriptions and client event delivery.

## Solution: Four Building Block Components + EventStore Enhancement

We'll create `@codeforbreakfast/eventsourcing-server` with four discrete, composable components that eliminate boilerplate while maintaining flexibility.

**Pre-requisite:** EventStore must support live cross-stream subscriptions via `subscribeAll()` (see hp-8).

### 1. EventBus

**Responsibility:** Live event distribution for server-side subscribers

**Boundaries:**

- Subscribes to EventStore.subscribeAll() to receive all events
- Distributes to server-side subscribers (process managers, projections)
- Live-only, best-effort delivery (no historical replay, no guarantees)
- NOT connected to clients or transport layer
- Does NOT commit events - only distributes them

**Interface:**

```typescript
class EventBus extends Context.Tag('EventBus')<
  EventBus,
  {
    subscribe: (
      filter: (event: DomainEvent) => boolean
    ) => Effect.Effect<Stream.Stream<DomainEvent>>;
  }
>() {}

const EventBusLive: (config: { store: EventStoreTag }) => Layer.Layer<EventBus, never, EventStore>;
```

**Dependencies:** EventStore (with subscribeAll support)

**Key Design:** EventBus uses EventStore.subscribeAll() internally, so process managers see events from ALL server instances, not just the local one.

### 2. CommandDispatcher

**Responsibility:** Route WireCommands to aggregate command methods

**Boundaries:**

- Receives WireCommand from ProtocolBridge
- Maps command name to aggregate method (convention: CreateTodo → createTodo)
- Loads aggregate state, executes command, commits to EventStore
- Returns CommandResult (Success/Failure)
- Does NOT publish to EventBus (EventBus gets events via subscribeAll)
- Does NOT know about ServerProtocol or transport

**Interface:**

```typescript
class CommandDispatcher extends Context.Tag('CommandDispatcher')<
  CommandDispatcher,
  {
    dispatch: (command: WireCommand) => Effect.Effect<CommandResult, DispatchError>;
  }
>() {}

const CommandDispatcherLive: (config: {
  aggregates: Array<AggregateConfig>;
}) => Layer.Layer<CommandDispatcher, never, never>;
```

**Dependencies:** Aggregate configurations, EventStore (implicitly via aggregates)

### 3. StoreSubscriptionManager

**Responsibility:** Bridge EventStore subscriptions to client subscriptions

**Boundaries:**

- Monitors ServerProtocol state for active client subscriptions
- Dynamically subscribes to EventStore for requested streams
- Pumps events from EventStore → ServerProtocol.publishEvent()
- Cleans up store subscriptions when last client unsubscribes
- Handles multiple EventStores (per aggregate type)
- Does NOT filter or route - ServerProtocol handles that

**Interface:**

```typescript
class StoreSubscriptionManager extends Context.Tag('StoreSubscriptionManager')<
  StoreSubscriptionManager,
  {
    start: () => Effect.Effect<never, SubscriptionError>;
  }
>() {}

const StoreSubscriptionManagerLive: (config: {
  stores: Array<{ tag: EventStoreTag; streamPattern?: (streamId: string) => boolean }>;
}) => Layer.Layer<StoreSubscriptionManager, never, ServerProtocol>;
```

**Dependencies:** ServerProtocol, EventStore tags

**Key Design Decision:** This component watches ServerProtocol's subscription state (the HashMap of streamId → connectionIds) and uses that to drive EventStore subscriptions. When the HashMap is updated, StoreSubscriptionManager sees it and subscribes/unsubscribes from stores accordingly.

### 4. ProtocolBridge

**Responsibility:** Wire ServerProtocol command stream to CommandDispatcher

**Boundaries:**

- Pure wiring function, NOT a service tag
- Connects protocol.onWireCommand → dispatcher.dispatch
- Sends CommandResult back via protocol.sendResult
- Does NOT handle events (that's StoreSubscriptionManager)
- Lifecycle managed by Effect Scope

**Interface:**

```typescript
const makeProtocolBridge: (
  protocol: Context.Tag.Service<typeof ServerProtocol>
) => Effect.Effect<never, BridgeError, CommandDispatcher | Scope.Scope>;
```

**Dependencies:** ServerProtocol, CommandDispatcher

## Component Interactions

### Command Flow

```
Client → Transport → ServerProtocol
                         ↓ onWireCommand
                    ProtocolBridge
                         ↓
                  CommandDispatcher
                         ↓
                    EventStore
                         ↓ subscribeAll()
                      EventBus
                         ↓
                  Process Managers
```

### Event Flow (to Clients)

```
EventStore.commit() by ANY instance
         ↓
StoreSubscriptionManager (subscribe per stream)
         ↓
ServerProtocol.publishEvent()
         ↓
     Clients (filtered by subscription)
```

### Event Flow (to Process Managers)

```
EventStore.commit() by ANY instance
         ↓ subscribeAll()
      EventBus
         ↓ filtered subscription
   Process Managers
```

**Critical Insight:** Events flow through TWO separate paths from EventStore:

1. **Client path:** EventStore.subscribe(streamId) → StoreSubscriptionManager → ServerProtocol → Clients
   - Per-stream subscriptions
   - Historical + live events
   - Filtered by client subscription

2. **Process Manager path:** EventStore.subscribeAll() → EventBus → Process Managers
   - All streams, live-only
   - Filtered by event type
   - Best-effort delivery

Both paths work across multiple server instances because they both subscribe to EventStore.

## Testing Strategy

### EventBus

- Subscribes to EventStore.subscribeAll()
- Type-safe filtering works correctly
- Multiple subscribers receive same event
- Scope cleanup (no leaked subscriptions)
- Live-only (events committed before subscription don't appear)
- Multi-instance (events from any server appear)
- Integration: Real EventStore with subscribeAll support

### CommandDispatcher

- Convention-based routing (WireCommand name → aggregate method)
- Aggregate state loading before execution
- Event commit to store
- CommandResult mapping (Success/Failure)
- Error handling (aggregate errors → Failure, not crashes)
- Does NOT publish to EventBus directly
- Integration: Real aggregate with real store

### StoreSubscriptionManager

- Watches ServerProtocol subscription state changes
- Subscribes to EventStore when clients subscribe
- Unsubscribes from EventStore when no clients remain
- Handles multiple stores correctly
- Events from store reach ServerProtocol.publishEvent
- Integration: Real ServerProtocol + real EventStore

### ProtocolBridge

- Commands from protocol reach dispatcher
- Results sent back through protocol
- One stream failure doesn't kill the other
- Scope interruption cleans up properly
- Integration: Full command → result flow

## Package Dependencies

```
@codeforbreakfast/eventsourcing-server
├── @codeforbreakfast/eventsourcing-protocol (ServerProtocol, WireCommand, CommandResult)
├── @codeforbreakfast/eventsourcing-aggregates (AggregateRoot interface)
├── @codeforbreakfast/eventsourcing-commands (command types)
├── @codeforbreakfast/eventsourcing-store (EventStore interface)
└── effect (Context, Layer, Stream, PubSub, etc.)
```

## Design Principles

1. **Low-level building blocks** - Export individual components, users compose them
2. **Convention over configuration** - WireCommand.name maps to aggregate method name
3. **Transport agnostic** - No component knows about WebSocket/HTTP
4. **Separation of concerns** - Each component has exactly one responsibility
5. **Effect-native DI** - Use Context.Tag and Layer throughout
6. **Type safety first** - Leverage Effect's type system

## Error Handling

**EventBus:** Publishing never fails (fire-and-forget internal)
**CommandDispatcher:** All errors become CommandResult.Failure, never crash
**StoreSubscriptionManager:** Log subscription errors, retry failed subscriptions
**ProtocolBridge:** Log errors, one direction failing doesn't kill the other

## EventStore.subscribeAll() Requirement

**New requirement for EventStore interface:**

All EventStore implementations must support live cross-stream subscriptions via `subscribeAll()`.

**Purpose:**

- Enable EventBus to receive events from all streams
- Support process managers across multiple server instances
- Avoid per-stream subscription management for server-side concerns

**Design Constraints:**

- Live-only (no historical replay, no global event number)
- Best-effort delivery (not guaranteed)
- Stream-independent (no global ordering)

**Implementation status:**

- See hp-8 for implementation task
- Must be completed before EventBus (hp-4) can be implemented

**If process managers need guarantees:**
Process managers that require guaranteed delivery, exactly-once processing, or replay capabilities should use external queues (SQS, RabbitMQ, etc.) instead of EventBus.

To integrate with external queues, applications can:

1. Create a custom component that subscribes to EventStore.subscribeAll() and publishes to queues
2. Extend/wrap CommandDispatcher to add queue publishing after commit
3. Use EventStore triggers (e.g., Postgres NOTIFY → Lambda → SQS)

The eventsourcing-server package itself does NOT provide queue publishing. CommandDispatcher only commits to EventStore, never publishes anywhere.

## Future Work (Out of Scope)

- Process manager declarative configuration (manual implementation for now)
- High-level convenience wrappers (users compose building blocks directly)
- HTTP/SSE transports (WebSocket only initially)
- Multi-store routing optimization
- Guaranteed delivery for process managers (use external queues)

## References

- Spike branch: `origin/feat/websocket-example`
- Spike package: `packages/eventsourcing-server/`
- Example server (manual wiring): `examples/todo-app/src/server.ts` (521 lines)
