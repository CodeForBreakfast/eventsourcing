# @codeforbreakfast/eventsourcing-server

**Transport-agnostic server infrastructure for event sourcing** - The core server logic without transport concerns.

## The Problem

The `@codeforbreakfast/eventsourcing` ecosystem provides excellent low-level building blocks (aggregates, event stores, transports, protocols), but building a complete server requires hundreds of lines of boilerplate to wire everything together.

**Current State (Todo Example)**: 2,236 lines of code

- Manual command routing (300+ lines)
- Manual event bus implementation (43 lines)
- Manual process manager wiring (241 lines)
- Manual protocol bridging (150+ lines)

**What It Should Be**: ~300 lines

- Define aggregates
- Define process managers (if needed)
- Wire to transport layer

## The Solution

This package provides **transport-agnostic server infrastructure** that handles:

✅ Command routing from Protocol to aggregates
✅ Event publishing to both internal event bus and Protocol
✅ Process manager infrastructure
✅ Layer composition and dependency injection

**Note**: This package is transport-agnostic. For WebSocket-specific convenience, see `@codeforbreakfast/eventsourcing-websocket` which provides `makeEventSourcingServer()` that combines this package with WebSocket transport.

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-server
bun add @codeforbreakfast/eventsourcing-protocol
bun add @codeforbreakfast/eventsourcing-aggregates
bun add @codeforbreakfast/eventsourcing-store-filesystem
```

## Quick Start

This package provides the **core server infrastructure**. For a complete server, you'll wire it to a transport layer (see usage examples below).

### Transport-Agnostic Usage

```typescript
import { makeServerRuntime } from '@codeforbreakfast/eventsourcing-server';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import { TodoAggregateRoot } from './domain/todoAggregate';
import { TodoListAggregateRoot } from './domain/todoListAggregate';

// Create the transport-agnostic runtime
const runtime = makeServerRuntime({
  aggregates: [TodoAggregateRoot, TodoListAggregateRoot],
  processManagers: [
    {
      name: 'TodoListManager',
      on: 'TodoCreated',
      execute: (event, { streamId }) =>
        TodoListAggregateRoot.commands.addTodo(streamId as TodoId, event.data.title),
      target: () => 'todo-list-main' as TodoListId,
    },
  ],
});

// Wire to any transport (WebSocket, HTTP, SSE, etc.)
const program = pipe(
  ServerProtocol,
  Effect.flatMap(runtime.handleProtocol),
  Effect.provide(yourTransportLayer) // WebSocket, HTTP, etc.
);
```

### With WebSocket (Convenience)

For the common WebSocket case, use `@codeforbreakfast/eventsourcing-websocket`:

```typescript
import { makeEventSourcingServer } from '@codeforbreakfast/eventsourcing-websocket';
import { TodoAggregateRoot } from './domain/todoAggregate';

// One-liner for WebSocket server
const server = makeEventSourcingServer({
  port: 8080,
  aggregates: [TodoAggregateRoot],
  // ... process managers, etc.
});

BunRuntime.runMain(server.start());
```

See `@codeforbreakfast/eventsourcing-websocket` documentation for WebSocket-specific features (HTTP static file serving, etc.).

## Core Concepts

### 1. Automatic Command Routing

The runtime automatically routes `WireCommand` messages to the appropriate aggregate based on command name and target.

```typescript
// Protocol receives:
{
  id: 'cmd-123',
  name: 'CreateTodo',
  target: 'todo-456',
  payload: { title: 'Buy milk' }
}

// Runtime automatically:
// 1. Loads TodoAggregate state for 'todo-456'
// 2. Executes TodoAggregate.commands.createTodo(payload)
// 3. Commits events to event store
// 4. Publishes events to event bus
// 5. Publishes events back to Protocol
```

**Convention**: Command name must match aggregate command method (e.g., `CreateTodo` → `createTodo`)

### 2. Integrated Event Bus

All committed events are automatically published to:

- **Internal event bus** (for process managers and projections)
- **ServerProtocol** (which forwards to transport layer)

No manual bridging required.

### 3. Declarative Process Managers

Process managers react to events and trigger commands on other aggregates.

```typescript
processManagers: [
  {
    name: 'OrderFulfillment',
    on: 'OrderPlaced',
    execute: (event) => InventoryAggregate.commands.reserveItems(event.data.items),
    target: (event) => event.data.warehouseId,
  },
];
```

The runtime handles:

- Event subscription
- Aggregate loading
- Command execution
- Event committing
- Error handling

## API Reference

### `makeServerRuntime(config)`

Creates a transport-agnostic server runtime that handles command routing, event publishing, and process managers.

**Parameters:**

```typescript
interface ServerRuntimeConfig<TEvent, TMetadata> {
  // Aggregate root configurations
  aggregates: Array<AggregateRootConfig<TEvent, TMetadata>>;

  // Optional process managers
  processManagers?: Array<ProcessManagerConfig<TEvent, TMetadata>>;

  // Optional command initiator (defaults to 'system')
  systemUser?: TMetadata;
}
```

**Returns:**

```typescript
interface ServerRuntime {
  // Handle ServerProtocol commands and events
  handleProtocol: (protocol: ServerProtocol) => Effect.Effect<never, ServerError, Scope.Scope>;

  // Access to the event bus for custom integrations
  eventBus: EventBusService;

  // For testing: execute commands directly
  executeCommand: (command: WireCommand) => Effect.Effect<CommandResult, ServerError>;
}
```

**Usage:**

```typescript
import { makeServerRuntime } from '@codeforbreakfast/eventsourcing-server';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';

const runtime = makeServerRuntime({
  aggregates: [TodoAggregateRoot],
  processManagers: [...],
});

// Wire to any transport
const program = pipe(
  ServerProtocol,
  Effect.flatMap(runtime.handleProtocol),
  Effect.provide(yourTransportLayer)
);
```

### Aggregate Root Config

Aggregates are registered by passing their configuration objects (created by `makeAggregateRoot`).

```typescript
import {
  makeAggregateRoot,
  defineAggregateEventStore,
} from '@codeforbreakfast/eventsourcing-aggregates';

const TodoAggregate = defineAggregateEventStore<TodoEvent, UserId>('Todo');

const TodoAggregateRoot = makeAggregateRoot(TodoIdSchema, UserIdSchema, applyEvent, TodoAggregate, {
  createTodo, // Maps to 'CreateTodo' command
  complete, // Maps to 'Complete' command
  deleteTodo, // Maps to 'DeleteTodo' command
});

// Pass to server config
aggregates: [TodoAggregateRoot];
```

The server automatically:

1. Extracts command names from the commands object
2. Creates route handlers for each command
3. Sets up event store layers
4. Handles the load → execute → commit → publish pipeline

### Process Manager Config

```typescript
interface ProcessManagerConfig<TEvent, TMetadata> {
  // Descriptive name for logging
  name: string;

  // Event type to react to
  on: TEvent['type'];

  // Command to execute when event occurs
  execute: (
    event: TEvent,
    context: { streamId: string }
  ) => Effect.Effect<ReadonlyArray<TEvent>, Error>;

  // Target aggregate stream (can be derived from event)
  target: (event: TEvent, context: { streamId: string }) => string;
}
```

**Example:**

```typescript
{
  name: 'SendWelcomeEmail',
  on: 'UserRegistered',
  execute: (event) => EmailAggregate.commands.sendWelcome(event.data.email),
  target: (event) => `email-${event.data.userId}`,
}
```

## Architecture

### What This Package Provides (Transport-Agnostic Layer)

```
┌─────────────────────────────────────────────────────────┐
│  @codeforbreakfast/eventsourcing-server                 │
│  (Transport-agnostic runtime)                           │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Command Dispatcher                               │   │
│  │  - Automatic routing: WireCommand → Aggregate     │   │
│  │  - Load → Execute → Commit → Publish pipeline     │   │
│  │  - Error handling and result mapping              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Event Bus                                        │   │
│  │  - Internal pub/sub for process managers          │   │
│  │  - Automatic bridging to ServerProtocol           │   │
│  │  - Type-safe event filtering                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Process Manager Runtime                          │   │
│  │  - Event subscription setup                       │   │
│  │  - Command execution                              │   │
│  │  - Error handling and retries                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Protocol Bridge                                  │   │
│  │  - ServerProtocol.onWireCommand → Dispatcher      │   │
│  │  - EventBus → ServerProtocol.publishEvent         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### How It Connects to Existing Packages

```
Transport Layer
(WebSocket, HTTP, SSE, etc.)
       │
       ├─► ServerProtocol (@codeforbreakfast/eventsourcing-protocol)
       │         │
       │         ├─► makeServerRuntime (this package)
       │         │         │
       │         │         ├─► Aggregate Roots (@codeforbreakfast/eventsourcing-aggregates)
       │         │         │
       │         │         └─► Event Stores (@codeforbreakfast/eventsourcing-store-*)
       │         │
       │         └─► Your domain code (aggregates, commands, events)
       │
       └─► Transport-specific features (@codeforbreakfast/eventsourcing-websocket)
               - HTTP static files
               - WebSocket lifecycle
               - Port binding
```

### Layer Separation

- **This package**: Command routing, event bus, process managers (transport-agnostic)
- **eventsourcing-websocket**: WebSocket server bootstrap, HTTP static files
- **eventsourcing-protocol**: Wire protocol, serialization
- **eventsourcing-transport-websocket**: Low-level WebSocket transport

## Implementation Plan

### Phase 1: Core Infrastructure (Minimum Viable Product)

**Goal**: Transport-agnostic server runtime

1. **Event Bus Service**
   - `makeEventBus()`: Creates internal pub/sub
   - Type-safe event filtering
   - Scoped lifecycle management
   - **File**: `src/lib/eventBus.ts`

2. **Command Dispatcher**
   - `makeCommandDispatcher(aggregates)`: Auto-routing from WireCommand
   - Aggregate command name inference
   - Load → Execute → Commit → Publish pipeline
   - **File**: `src/lib/commandDispatcher.ts`

3. **Protocol Bridge**
   - Auto-bridge ServerProtocol.onWireCommand → CommandDispatcher
   - Auto-bridge EventBus → ServerProtocol.publishEvent
   - Handle both directions automatically
   - **File**: `src/lib/protocolBridge.ts`

4. **Server Runtime**
   - `makeServerRuntime({ aggregates })`
   - Compose all layers
   - Return runtime interface
   - **File**: `src/lib/serverRuntime.ts`

**Success Criteria**: Todo example server.ts reduced from 521 to ~100 lines (using runtime + WebSocket wrapper)

### Phase 2: Process Managers

5. **Process Manager Runtime**
   - `makeProcessManagerRuntime(config)`
   - Event subscription setup
   - Command execution with proper context
   - **File**: `src/lib/processManager.ts`

6. **Declarative Config**
   - Support `on` + `execute` + `target` syntax
   - Auto-infer event types from aggregates

**Success Criteria**: Todo processManager.ts (241 lines) becomes ~20 line config

### Phase 3: Developer Experience

7. **Error Handling & Logging**
   - Structured logging
   - Error recovery strategies
   - Developer-friendly error messages

8. **Testing Utilities**
   - `executeCommand()` for unit testing
   - Event bus inspection
   - Command execution helpers

**Success Criteria**: Great DX, easy to debug

### Phase 4: WebSocket Integration (Separate Package)

This happens in `@codeforbreakfast/eventsourcing-websocket`:

9. **Server Convenience Function**
   - `makeEventSourcingServer()` in WebSocket package
   - Combines ServerRuntime + WebSocketAcceptor
   - HTTP static file serving
   - **File**: `packages/eventsourcing-websocket/src/lib/server.ts`

**Success Criteria**: Todo example becomes ~50 lines total

## Design Principles

### 1. Convention Over Configuration

Command names automatically map to aggregate methods:

- `CreateTodo` → `todoAggregate.commands.createTodo`
- `UpdateUser` → `userAggregate.commands.updateUser`

No manual routing tables required.

### 2. Make Simple Things Simple

The common case (single aggregate CRUD) should be trivial.

**For this package** (transport-agnostic):

```typescript
const runtime = makeServerRuntime({
  aggregates: [UserAggregate],
});
```

**For WebSocket** (via eventsourcing-websocket):

```typescript
makeEventSourcingServer({
  port: 8080,
  aggregates: [UserAggregate],
});
```

### 3. Make Complex Things Possible

Advanced users can still:

- Override command routing
- Implement custom event buses
- Add middleware
- Use low-level packages directly

But they shouldn't have to for the 80% case.

### 4. Type Safety First

All event types, command types, and aggregate states should be fully typed. TypeScript should guide you to success.

### 5. Explicit Over Magic

Prefer:

```typescript
processManagers: [
  {
    name: 'SendEmail',
    on: 'UserRegistered',
    execute: (event) => emailCommand(event),
    target: (event) => event.data.userId,
  },
];
```

Over:

```typescript
@OnEvent('UserRegistered')  // Magic decorators
sendEmail(event) { ... }
```

## Comparison with Current Approach

| Aspect             | Without This Package              | With This Package (+ WebSocket)        |
| ------------------ | --------------------------------- | -------------------------------------- |
| Command Routing    | 150+ lines of manual routing      | Automatic from aggregate commands      |
| Event Publishing   | Manual bridging in 2 places       | Automatic to bus + protocol            |
| Process Managers   | 241 lines of stream handling      | Declarative config (~10 lines each)    |
| Protocol Bridge    | 100+ lines of manual wiring       | Automatic                              |
| Event Bus          | 43 lines of custom implementation | Built-in service                       |
| Transport Setup    | Manual layer composition          | WebSocket package convenience function |
| Total for Todo App | 2,236 lines                       | ~50 lines                              |

## Migration Guide

### From Manual Server Setup

**Before (Current Todo Example):**

```typescript
// server.ts: 521 lines of manual wiring
const makeTodoEventStore = () => {
  /* ... */
};
const commitAndPublishEvents = () => {
  /* ... */
};
const createTodoFromCommand = () => {
  /* ... */
};
const routeCommand = () => {
  /* ... */
};
const handleCommandDispatch = () => {
  /* ... */
};
// ... many more helpers

// infrastructure/eventBus.ts: 43 lines
// infrastructure/processManager.ts: 241 lines
```

**After (With This Package + WebSocket):**

```typescript
import { makeEventSourcingServer } from '@codeforbreakfast/eventsourcing-websocket';
import { TodoAggregateRoot, TodoListAggregateRoot } from './domain';

const server = makeEventSourcingServer({
  port: 8080,
  aggregates: [TodoAggregateRoot, TodoListAggregateRoot],
  processManagers: [
    {
      name: 'TodoListManager',
      on: 'TodoCreated',
      execute: (event, { streamId }) =>
        TodoListAggregateRoot.commands.addTodo(streamId, event.data.title),
      target: () => 'todo-list-main',
    },
  ],
});

BunRuntime.runMain(server.start());
```

That's it. ~25 lines instead of 2,236.

## Advanced Usage

### Custom Command Routing

Override default routing for special cases:

```typescript
makeEventSourcingServer({
  // ... config
  commandRouter: (command) => {
    if (command.name.startsWith('Legacy')) {
      return legacyCommandHandler(command);
    }
    return undefined; // Fall back to automatic routing
  },
});
```

### Multiple Event Stores

Different aggregates can use different stores:

```typescript
aggregates: [
  {
    root: TodoAggregateRoot,
    store: makeFileSystemEventStore({ baseDir: './todos' }),
  },
  {
    root: UserAggregateRoot,
    store: makePostgresEventStore({ connectionString: '...' }),
  },
];
```

### Custom Event Bus

Replace the default event bus:

```typescript
makeEventSourcingServer({
  // ... config
  eventBus: myCustomEventBus, // Must implement EventBusService interface
});
```

## Contributing

This package is the missing piece of the eventsourcing ecosystem. Contributions are especially welcome for:

- Process manager error handling strategies
- Testing utilities
- Performance optimizations
- Documentation improvements

See the main repository for contribution guidelines.

## Roadmap

- [ ] **v0.1.0**: Core infrastructure (command dispatcher, event bus, basic server)
- [ ] **v0.2.0**: Process managers
- [ ] **v0.3.0**: HTTP server integration
- [ ] **v0.4.0**: Testing utilities
- [ ] **v0.5.0**: Advanced routing and middleware
- [ ] **v1.0.0**: Production-ready, stable API

## License

MIT

---

**Note**: This package is currently in development. The API described above is the target design. Implementation is tracked in the main repository issues.
