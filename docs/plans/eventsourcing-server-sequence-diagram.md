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
    participant Store as EventStore<br/>(existing)
    participant Bus as EventBus<br/>(NEW)
    participant PM as Process Manager

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

    Dispatcher->>Bus: publish(TodoCreated)
    Bus->>PM: Stream.emit(TodoCreated)
    PM->>PM: React to event

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
    participant Store as EventStore
    participant Bus as EventBus
    participant SubMgr as StoreSubscriptionManager
    participant PM as Process Manager

    Note over C1,PM: Setup: Client 1 already subscribed to "todo-123"

    C1->>Protocol: Subscribe(todo-123)
    Protocol->>Protocol: HashMap.set(todo-123, [client1])
    SubMgr->>Store: subscribe(todo-123)

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

    Note over Dispatcher,Bus: Server-side path (immediate)
    Dispatcher->>Bus: publish(TodoCreated)
    Bus->>PM: Stream.emit(TodoCreated)

    Note over Store,SubMgr: Client path (durable)
    Store->>SubMgr: Stream.emit(TodoCreated)<br/>(from subscription)
    SubMgr->>Protocol: publishEvent(TodoCreated)
    Protocol->>Protocol: Check HashMap:<br/>todo-123 → [client1]
    Protocol->>Transport: Broadcast to client1
    Transport-->>C1: Receive TodoCreated

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
    participant Store as EventStore
    participant Bus as EventBus
    participant PM as Process Manager
    participant Agg2 as Different Aggregate

    Note over Dispatcher,Agg2: Command executes on TodoAggregate

    Dispatcher->>Store: commit([TodoCreated])
    Store-->>Dispatcher: Position

    Dispatcher->>Bus: publish(TodoCreated)
    Note over Bus: Immediate, in-memory

    Bus->>PM: Stream.emit(TodoCreated)
    PM->>PM: Filter: interested<br/>in TodoCreated
    PM->>PM: Execute reaction:<br/>"Add to TodoList"

    PM->>Dispatcher: dispatch(AddToList)
    Note over Dispatcher: Routes to TodoListAggregate

    Dispatcher->>Agg2: Load & execute
    Agg2-->>Dispatcher: [TodoListUpdated]
    Dispatcher->>Store: commit([TodoListUpdated])
    Dispatcher->>Bus: publish(TodoListUpdated)
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
    Store[EventStore<br/>existing]
    Agg[AggregateRoot<br/>existing]
    PM[Process Manager]

    Client -->|WebSocket| Transport
    Transport --> Protocol
    Protocol -->|onWireCommand Stream| Bridge
    Bridge -->|dispatch| Dispatcher

    Dispatcher -->|load/commit| Store
    Dispatcher -->|execute commands| Agg
    Dispatcher -->|publish events| Bus

    Bus -->|subscribe| PM
    PM -->|dispatch commands| Dispatcher

    SubMgr -->|watch subscriptions| Protocol
    SubMgr -->|subscribe| Store
    SubMgr -->|publishEvent| Protocol

    Store -->|events| SubMgr
    Protocol -->|results & events| Transport

    style Bridge fill:#90EE90
    style Dispatcher fill:#90EE90
    style Bus fill:#90EE90
    style SubMgr fill:#90EE90

    style Protocol fill:#87CEEB
    style Store fill:#87CEEB
    style Agg fill:#87CEEB
```

## Key Insights

### Two Event Paths

1. **Server-side (EventBus):**
   - CommandDispatcher → EventBus → Process Managers
   - Immediate, in-memory
   - No historical replay
   - Single server instance only

2. **Client-side (StoreSubscriptionManager):**
   - EventStore → StoreSubscriptionManager → ServerProtocol → Clients
   - Durable, multi-instance
   - Historical + live events
   - Works across server instances

### Critical Design Points

1. **StoreSubscriptionManager watches ServerProtocol state**
   - Creates/destroys EventStore subscriptions dynamically
   - Based on active client subscriptions
   - Reference counting (last client unsubscribe → cleanup)

2. **ProtocolBridge is just wiring**
   - Pure function, not a service
   - Commands in, results out
   - No event handling (that's StoreSubscriptionManager)

3. **CommandDispatcher is the orchestrator**
   - Routes commands
   - Commits to store
   - Publishes to bus
   - Returns results

4. **EventBus is server-internal only**
   - Process managers
   - Projections
   - NOT for client delivery
