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

## Solution: Four Building Block Components

We'll create `@codeforbreakfast/eventsourcing-server` with four discrete, composable components that eliminate boilerplate while maintaining flexibility.

### 1. EventBus

**Responsibility:** In-memory pub/sub for server-side event distribution

**Boundaries:**

- Receives events from CommandDispatcher after commit
- Distributes to server-side subscribers (process managers, projections)
- NO historical replay - only current events
- NOT connected to clients or transport layer
- Does NOT know about EventStore or aggregates

**Interface:**

```typescript
class EventBus extends Context.Tag('EventBus')<
  EventBus,
  {
    publish: (event: DomainEvent) => Effect.Effect<void>;
    subscribe: (
      filter: (event: DomainEvent) => boolean
    ) => Effect.Effect<Stream.Stream<DomainEvent>>;
  }
>() {}

const EventBusLive: Layer.Layer<EventBus>;
```

**Dependencies:** Effect primitives only (PubSub, Stream)

### 2. CommandDispatcher

**Responsibility:** Route WireCommands to aggregate command methods

**Boundaries:**

- Receives WireCommand from ProtocolBridge
- Maps command name to aggregate method (convention: CreateTodo → createTodo)
- Loads aggregate state, executes command, commits to EventStore
- Publishes committed events to EventBus
- Returns CommandResult (Success/Failure)
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
}) => Layer.Layer<CommandDispatcher, never, EventBus>;
```

**Dependencies:** EventBus, aggregate configurations

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
                    ↓         ↓
              EventStore   EventBus
                              ↓
                      Process Managers
```

### Event Flow

```
EventStore.commit() by ANY instance
         ↓
StoreSubscriptionManager (subscribes to streams)
         ↓
ServerProtocol.publishEvent()
         ↓
     Clients (filtered by subscription)
```

### Process Manager Flow

```
CommandDispatcher → EventStore → EventBus → Process Managers
```

**Critical Insight:** Events flow through TWO separate paths:

1. **Client path:** EventStore → StoreSubscriptionManager → ServerProtocol → Clients
2. **Server path:** CommandDispatcher → EventBus → Process Managers

This separation ensures process managers get immediate notification (no store roundtrip) while clients get durable, multi-instance event delivery through store subscriptions.

## Testing Strategy

### EventBus

- Publish/subscribe with type-safe filtering
- Multiple subscribers receive same event
- Scope cleanup (no leaked subscriptions)
- Integration: Real events from test aggregate

### CommandDispatcher

- Convention-based routing (WireCommand name → aggregate method)
- Aggregate state loading before execution
- Event commit to store
- Event publish to EventBus
- CommandResult mapping (Success/Failure)
- Error handling (aggregate errors → Failure, not crashes)
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

## Future Work (Out of Scope)

- Process manager declarative configuration (manual implementation for now)
- High-level convenience wrappers (users compose building blocks directly)
- HTTP/SSE transports (WebSocket only initially)
- Multi-store routing optimization

## References

- Spike branch: `origin/feat/websocket-example`
- Spike package: `packages/eventsourcing-server/`
- Example server (manual wiring): `examples/todo-app/src/server.ts` (521 lines)
