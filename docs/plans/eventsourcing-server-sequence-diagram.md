# Event Sourcing Server - Component Interaction Sequences

## Command Execution Flow

```mermaid
sequenceDiagram
    participant Client
    participant Transport as Transport<br/>(WebSocket)
    participant Protocol as ServerProtocol<br/>(existing)
    participant Bridge as ProtocolBridge<br/>(NEW)
    participant Dispatcher as CommandDispatcher<br/>(NEW)
    participant Aggregate as AggregateRoot<br/>(existing)
    participant Store as EventStore<br/>(existing + subscribeAll)

    Client->>Transport: Send WireCommand<br/>{CreateTodo, payload}
    Transport->>Protocol: TransportMessage
    Protocol->>Protocol: Parse & validate
    Protocol->>Bridge: Stream.emit(WireCommand)

    Bridge->>Dispatcher: dispatch(WireCommand)
    Dispatcher->>Dispatcher: Route "CreateTodo"<br/>→ aggregate.createTodo
    Dispatcher->>Store: load(aggregateId)
    Store-->>Dispatcher: AggregateState

    Dispatcher->>Aggregate: execute command<br/>with current state
    Aggregate-->>Dispatcher: [TodoCreated events]

    Dispatcher->>Store: commit(events)
    Store-->>Dispatcher: EventStreamPosition

    Note over Store: Events now in store,<br/>subscribeAll() broadcasts them

    Dispatcher-->>Bridge: CommandResult.Success
    Bridge->>Protocol: sendResult(commandId, result)
    Protocol->>Transport: TransportMessage(result)
    Transport-->>Client: Command succeeded
```

## Client Subscription & Event Delivery Flow

```mermaid
sequenceDiagram
    participant Client
    participant Transport as Transport<br/>(WebSocket)
    participant Protocol as ServerProtocol<br/>(existing)
    participant SubMgr as StoreSubscriptionManager<br/>(NEW)
    participant Store as EventStore<br/>(existing)

    Note over Client,Store: Client subscribes to stream

    Client->>Transport: Subscribe(streamId: "todo-123")
    Transport->>Protocol: TransportMessage(subscribe)
    Protocol->>Protocol: Add to subscriptions<br/>HashMap.set(todo-123, [clientId])

    SubMgr->>Protocol: Watch subscription state
    SubMgr->>SubMgr: Detect new subscription<br/>for "todo-123"
    SubMgr->>Store: subscribe(streamId: "todo-123")
    Store-->>SubMgr: Stream<Events>

    Note over SubMgr,Store: Events committed by ANY server instance

    Store->>SubMgr: Stream.emit(TodoCreated)
    SubMgr->>Protocol: publishEvent(TodoCreated)
    Protocol->>Protocol: Check subscriptions<br/>HashMap.get(todo-123)
    Protocol->>Transport: broadcast to subscribed clients
    Transport-->>Client: Receive TodoCreated event

    Note over Client,Store: Client unsubscribes

    Client->>Transport: Unsubscribe
    Transport->>Protocol: Remove from subscriptions
    Protocol->>Protocol: HashMap.remove(clientId)

    SubMgr->>Protocol: Watch subscription state
    SubMgr->>SubMgr: Detect last client gone
    SubMgr->>Store: Interrupt subscription
```

## Complete End-to-End Flow (Command → Event Delivery)

```mermaid
sequenceDiagram
    participant C1 as Client 1<br/>(subscribed)
    participant C2 as Client 2<br/>(sends command)
    participant Transport
    participant Protocol as ServerProtocol
    participant Bridge as ProtocolBridge
    participant Dispatcher as CommandDispatcher
    participant Store as EventStore<br/>(+ subscribeAll)
    participant Bus as EventBus
    participant SubMgr as StoreSubscriptionManager
    participant PM as Process Manager

    Note over C1,PM: Setup: Client 1 subscribed, EventBus subscribed to subscribeAll()

    C1->>Protocol: Subscribe(todo-123)
    Protocol->>Protocol: HashMap.set(todo-123, [client1])
    SubMgr->>Store: subscribe(todo-123)

    Bus->>Store: subscribeAll()
    Store-->>Bus: Live event stream

    Note over C1,PM: Client 2 sends command

    C2->>Transport: CreateTodo command
    Transport->>Protocol: WireCommand
    Protocol->>Bridge: Stream.emit(WireCommand)
    Bridge->>Dispatcher: dispatch(command)

    Note over Dispatcher: Convention routing:<br/>CreateTodo → aggregate.createTodo

    Dispatcher->>Store: load(todo-123)
    Store-->>Dispatcher: Current state
    Dispatcher->>Dispatcher: Execute command
    Dispatcher->>Store: commit([TodoCreated])

    Note over Store: Store broadcasts to ALL subscribers

    Note over Store,SubMgr: Client path (per-stream)
    Store->>SubMgr: Stream.emit(TodoCreated)<br/>(from subscribe)
    SubMgr->>Protocol: publishEvent(TodoCreated)
    Protocol->>Protocol: Check HashMap:<br/>todo-123 → [client1]
    Protocol->>Transport: Broadcast to client1
    Transport-->>C1: Receive TodoCreated

    Note over Store,Bus: Process Manager path (subscribeAll)
    Store->>Bus: Stream.emit(TodoCreated)<br/>(from subscribeAll)
    Bus->>PM: Filtered stream
    PM->>PM: React to event

    Dispatcher-->>Bridge: CommandResult.Success
    Bridge->>Protocol: sendResult(commandId)
    Protocol->>Transport: Send result
    Transport-->>C2: Command succeeded
```

## Multi-Instance Event Delivery

```mermaid
sequenceDiagram
    participant C as Client
    participant S1 as Server Instance 1
    participant S2 as Server Instance 2
    participant Store as EventStore<br/>(shared)
    participant SM1 as StoreSubscriptionManager<br/>(Instance 1)
    participant SM2 as StoreSubscriptionManager<br/>(Instance 2)

    Note over C,SM2: Client connected to Instance 1

    C->>S1: Subscribe(todo-123)
    S1->>SM1: Subscription detected
    SM1->>Store: subscribe(todo-123)

    Note over C,SM2: Command executed on Instance 2

    S2->>S2: CommandDispatcher<br/>executes command
    S2->>Store: commit(events)

    Note over Store: Store broadcasts to ALL subscribers

    Store->>SM1: Stream.emit(TodoCreated)
    Store->>SM2: Stream.emit(TodoCreated)

    SM1->>S1: publishEvent(TodoCreated)
    S1->>C: Event delivered!

    SM2->>S2: publishEvent(TodoCreated)
    Note over S2: No clients subscribed<br/>on Instance 2
```

## Process Manager Reaction Flow

```mermaid
sequenceDiagram
    participant Dispatcher as CommandDispatcher
    participant Store as EventStore<br/>(+ subscribeAll)
    participant Bus as EventBus
    participant PM as Process Manager
    participant Agg2 as Different Aggregate

    Note over Bus,Store: EventBus subscribed to subscribeAll()

    Note over Dispatcher,Agg2: Command executes on TodoAggregate

    Dispatcher->>Store: commit([TodoCreated])
    Store-->>Dispatcher: Position

    Note over Store: Store broadcasts via subscribeAll()

    Store->>Bus: Stream.emit(TodoCreated)
    Note over Bus: Via subscribeAll(), live-only

    Bus->>PM: Stream.emit(TodoCreated)
    PM->>PM: Filter: interested<br/>in TodoCreated
    PM->>PM: Execute reaction:<br/>"Add to TodoList"

    PM->>Dispatcher: dispatch(AddToList)
    Note over Dispatcher: Routes to TodoListAggregate

    Dispatcher->>Agg2: Load & execute
    Agg2-->>Dispatcher: [TodoListUpdated]
    Dispatcher->>Store: commit([TodoListUpdated])

    Note over Store: Broadcast again

    Store->>Bus: Stream.emit(TodoListUpdated)
```

## Component Dependencies Visualization

```mermaid
graph TB
    Client[Client]
    Transport[Transport<br/>WebSocket]
    Protocol[ServerProtocol<br/>existing]
    Bridge[ProtocolBridge<br/>NEW]
    Dispatcher[CommandDispatcher<br/>NEW]
    Bus[EventBus<br/>NEW]
    SubMgr[StoreSubscriptionManager<br/>NEW]
    Store[EventStore<br/>existing + subscribeAll]
    Agg[AggregateRoot<br/>existing]
    PM[Process Manager]

    Client -->|WebSocket| Transport
    Transport --> Protocol
    Protocol -->|onWireCommand Stream| Bridge
    Bridge -->|dispatch| Dispatcher

    Dispatcher -->|load/commit| Store
    Dispatcher -->|execute commands| Agg

    Store -->|subscribeAll| Bus
    Bus -->|subscribe| PM
    PM -->|dispatch commands| Dispatcher

    SubMgr -->|watch subscriptions| Protocol
    SubMgr -->|subscribe per-stream| Store
    SubMgr -->|publishEvent| Protocol

    Protocol -->|results & events| Transport

    style Bridge fill:#90EE90
    style Dispatcher fill:#90EE90
    style Bus fill:#90EE90
    style SubMgr fill:#90EE90

    style Protocol fill:#87CEEB
    style Store fill:#FFD700
    style Agg fill:#87CEEB

    classDef modified fill:#FFD700
```

## Key Insights

### Two Event Paths from EventStore

1. **Process Manager path (via subscribeAll):**
   - EventStore.subscribeAll() → EventBus → Process Managers
   - Live-only (no historical replay)
   - Best-effort delivery
   - Works across multiple server instances
   - Filtered by event type

2. **Client path (via per-stream subscribe):**
   - EventStore.subscribe(streamId) → StoreSubscriptionManager → ServerProtocol → Clients
   - Historical + live events
   - Filtered by client subscription
   - Works across server instances

**Critical:** CommandDispatcher NEVER publishes to EventBus. Events flow: EventStore → EventBus (via subscribeAll).

### Critical Design Points

1. **EventStore.subscribeAll() is required**
   - New method added to EventStore interface (hp-8)
   - Live-only, no global event number
   - All EventStore implementations must support it
   - EventBus uses this exclusively

2. **No double events**
   - CommandDispatcher: commits to EventStore only
   - EventBus: receives from EventStore.subscribeAll() only
   - Single path = no duplication

3. **StoreSubscriptionManager watches ServerProtocol state**
   - Creates/destroys per-stream subscriptions dynamically
   - Based on active client subscriptions
   - Reference counting (last client unsubscribe → cleanup)

4. **ProtocolBridge is just wiring**
   - Pure function, not a service
   - Commands in, results out
   - No event handling (that's StoreSubscriptionManager)

5. **CommandDispatcher is simple**
   - Routes commands
   - Commits to store
   - Returns results
   - Does NOT publish anywhere

6. **Multi-instance support**
   - Both event paths work across server instances
   - Process managers see events from any instance
   - Clients receive events regardless of which instance committed them
