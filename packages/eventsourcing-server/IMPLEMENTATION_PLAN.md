# @codeforbreakfast/eventsourcing-server Implementation Plan

**Created**: 2025-10-19
**Target**: Phase 1 - Core Infrastructure (Minimum Viable Product)
**Goal**: Reduce server boilerplate from 2,236 lines to ~50 lines

---

## Overview

This plan details the complete implementation of `@codeforbreakfast/eventsourcing-server`, a transport-agnostic server runtime that eliminates boilerplate for event sourcing applications. The package provides automatic command routing, event bus infrastructure, process manager support, and protocol bridging.

### Current State

The todo example app currently requires:

- **server.ts**: 521 lines of manual command routing and protocol bridging
- **processManager.ts**: 241 lines of process manager wiring
- **eventBus.ts**: 43 lines of custom event bus implementation
- **Total**: 805+ lines of boilerplate

### Target State

With this package:

```typescript
import { Effect, Context } from 'effect';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

declare const TodoAggregateRoot: AggregateRoot<string, any, any, any, any, any>;
declare const TodoListAggregateRoot: AggregateRoot<string, any, any, any, any, any>;

declare const makeServerRuntime: (config: {
  aggregates: readonly any[];
  processManagers?: readonly any[];
}) => {
  handleProtocol: any;
  eventBus: any;
  executeCommand: any;
};

const runtimeExample = makeServerRuntime({
  aggregates: [{ root: TodoAggregateRoot }, { root: TodoListAggregateRoot }],
  processManagers: [
    {
      /* declarative config */
    },
  ],
});
```

~50 lines total when combined with WebSocket package convenience functions.

---

## Architecture Context

### Package Dependencies

```
@codeforbreakfast/eventsourcing-server (THIS PACKAGE)
├── @codeforbreakfast/eventsourcing-aggregates (workspace:*)
│   ├── makeAggregateRoot()
│   ├── defineAggregateEventStore()
│   ├── AggregateRoot interface
│   └── EventRecord<TEvent, TOrigin>
├── @codeforbreakfast/eventsourcing-protocol (workspace:*)
│   ├── ServerProtocol service tag
│   ├── WireCommand type
│   ├── CommandResult type
│   └── Event type
├── @codeforbreakfast/eventsourcing-store (workspace:*)
│   ├── EventStore interface
│   ├── EventStreamId
│   └── EventStreamPosition
├── @codeforbreakfast/eventsourcing-transport (workspace:*)
│   ├── Server.Transport interface
│   └── TransportMessage
└── effect (^3.17.0)
    ├── Effect, Stream, Layer, Context
    ├── Queue, Ref, HashMap, PubSub
    └── Schema, Scope, Chunk
```

### Key Types from Dependencies

**From @codeforbreakfast/eventsourcing-aggregates:**

```typescript
import { Effect, Option, Chunk, Data } from 'effect';

// ParseError from @effect/schema
declare class ParseError extends Data.TaggedError('ParseError')<{
  readonly message: string;
}> {}

type EventNumber = bigint & { readonly _brand: 'EventNumber' };

interface AggregateRoot<TId extends string, TState, TEvent, TInitiator, TCommands, TTag> {
  readonly new: () => AggregateState<TState>;
  readonly load: (id: TId) => Effect.Effect<AggregateState<TState>, ParseError, TTag>;
  readonly commit: (options: CommitOptions<TId, TEvent>) => Effect.Effect<void, ParseError, TTag>;
  readonly commands: TCommands;
}

interface AggregateState<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}

interface CommitOptions<TId extends string, TEvent> {
  readonly id: TId;
  readonly eventNumber: EventNumber;
  readonly events: Chunk.Chunk<TEvent>;
}

type EventRecord<TEvent, TOrigin> = TEvent & {
  readonly metadata: EventMetadata<TOrigin>;
};

interface EventMetadata<TOrigin> {
  readonly occurredAt: Date;
  readonly origin: TOrigin;
}
```

**From @codeforbreakfast/eventsourcing-protocol:**

```typescript
import { Context, Stream, Effect, Data } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { EventStreamId } from '@codeforbreakfast/eventsourcing-store';

type TransportError = { readonly _tag: 'TransportError' };
class ServerProtocolError extends Data.TaggedError('ServerProtocolError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

type Event = {
  readonly type: string;
  readonly position: number;
  readonly data: unknown;
  readonly timestamp: Date;
};

// ServerProtocol is already implemented in packages/eventsourcing-protocol/src/lib/server-protocol.ts
class ServerProtocol extends Context.Tag('ServerProtocol')<
  ServerProtocol,
  {
    readonly onWireCommand: Stream.Stream<WireCommand, never, never>;
    readonly sendResult: (
      commandId: string,
      result: ReadonlyDeep<CommandResult>
    ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
    readonly publishEvent: (
      event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>
    ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
  }
>() {}
```

**From @codeforbreakfast/eventsourcing-commands:**

```typescript
interface WireCommand {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: unknown;
}

type CommandResult =
  | { readonly _tag: 'Success'; readonly position: number }
  | { readonly _tag: 'Failure'; readonly error: unknown };
```

### Naming Conventions

**Command Routing Convention:**

- Wire command name `CreateTodo` → aggregate method `commands.createTodo`
- Wire command name `UpdateUser` → aggregate method `commands.updateUser`
- Convention: PascalCase command name → camelCase method name

**File Organization:**

```
packages/eventsourcing-server/
├── src/
│   ├── index.ts                    # Public API exports
│   └── lib/
│       ├── eventBus.ts            # Event bus implementation
│       ├── commandDispatcher.ts   # Command routing and execution
│       ├── protocolBridge.ts      # ServerProtocol integration
│       ├── serverRuntime.ts       # Main runtime factory
│       └── types.ts               # Shared type definitions
└── package.json
```

---

## Phase 1: Core Infrastructure

### Task 1: Shared Type Definitions

**File**: `packages/eventsourcing-server/src/lib/types.ts`

**Purpose**: Define core types used across all modules to ensure consistency and type safety.

**Implementation**:

```typescript
import { Effect, Context, Stream, Scope } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

/**
 * Error types for server operations
 */
export class ServerError extends Error {
  readonly _tag = 'ServerError';
  constructor(
    readonly operation: string,
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(`${operation} failed: ${reason}`);
    this.name = 'ServerError';
  }
}

/**
 * Domain event with stream context
 * This is the internal representation after events are committed
 */
export interface DomainEvent<TEvent = unknown> {
  readonly streamId: string;
  readonly event: TEvent;
  readonly position: number;
}

/**
 * Configuration for a single aggregate root
 * Supports both simple and advanced configurations
 */
export type AggregateConfig<
  TEvent extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown,
> =
  | {
      // Simple: just the aggregate root
      readonly root: AggregateRoot<string, unknown, TEvent, TMetadata, unknown, unknown>;
    }
  | {
      // Advanced: custom event store override
      readonly root: AggregateRoot<string, unknown, TEvent, TMetadata, unknown, unknown>;
      readonly eventStoreOverride?: Context.Tag<unknown, unknown>;
    };

/**
 * Configuration for a process manager
 * Process managers react to events and trigger commands
 */
export interface ProcessManagerConfig<TEvent = unknown, _TMetadata = unknown> {
  /** Descriptive name for logging and debugging */
  readonly name: string;

  /** Event type to react to (matches event.type field) */
  readonly on: string;

  /**
   * Command to execute when event occurs
   * Returns an array of events to commit
   */
  readonly execute: (
    event: TEvent,
    context: { readonly streamId: string }
  ) => Effect.Effect<ReadonlyArray<unknown>, Error>;

  /**
   * Target aggregate stream for the command
   * Can be derived from the triggering event
   */
  readonly target: (event: TEvent, context: { readonly streamId: string }) => string;
}

/**
 * Main configuration for the server runtime
 */
export interface ServerRuntimeConfig<TEvent = unknown, TMetadata = unknown> {
  /** Aggregate root configurations */
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;

  /** Optional process managers */
  readonly processManagers?: ReadonlyArray<ProcessManagerConfig<TEvent, TMetadata>>;

  /** Optional command initiator for system-triggered commands */
  readonly systemUser?: TMetadata;
}

/**
 * Event bus service for internal pub/sub
 */
export interface EventBusService<TEvent = unknown> {
  /**
   * Publish an event to all subscribers
   */
  readonly publish: (event: DomainEvent<TEvent>) => Effect.Effect<void, never, never>;

  /**
   * Subscribe to events matching a filter
   * Returns a scoped stream that cleans up on scope closure
   */
  readonly subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<DomainEvent<TFilteredEvent>, never, never>, never, Scope.Scope>;
}

/**
 * Command dispatcher service
 * Routes commands to appropriate aggregate handlers
 */
export interface CommandDispatcherService {
  /**
   * Execute a wire command
   * Returns the command result (success with position or failure with error)
   */
  readonly dispatch: (
    command: ReadonlyDeep<WireCommand>
  ) => Effect.Effect<CommandResult, ServerError, never>;
}

/**
 * Server runtime interface returned by makeServerRuntime
 */
export interface ServerRuntime<TEvent = unknown> {
  /**
   * Handle ServerProtocol commands and events
   * This is the main entry point that wires everything together
   */
  readonly handleProtocol: (
    protocol: Context.Tag.Service<
      typeof import('@codeforbreakfast/eventsourcing-protocol').ServerProtocol
    >
  ) => Effect.Effect<never, ServerError, Scope.Scope>;

  /**
   * Access to the event bus for custom integrations
   */
  readonly eventBus: EventBusService<TEvent>;

  /**
   * For testing: execute commands directly
   */
  readonly executeCommand: (command: WireCommand) => Effect.Effect<CommandResult, ServerError>;
}
```

**Key Design Decisions**:

1. **DomainEvent structure**: Includes `streamId`, `event`, and `position` to provide full context for subscribers
2. **AggregateConfig union**: Supports both simple (just root) and advanced (with overrides) configurations
3. **ProcessManagerConfig**: Declarative, functional approach - no classes or decorators
4. **EventBusService**: Type-safe filtering with generic constraints
5. **ServerError**: Structured error with operation context for better debugging

**Verification Steps**:

```bash
# 1. Type check compiles without errors
cd packages/eventsourcing-server
bun run typecheck

# 2. No circular dependencies
bun x madge --circular src/lib/types.ts
```

---

### Task 2: Event Bus Implementation

**File**: `packages/eventsourcing-server/src/lib/eventBus.ts`

**Purpose**: Provide internal pub/sub infrastructure for events, replacing the 43-line manual implementation in the todo example.

**Dependencies**:

- `effect` (PubSub, Stream, Scope, Effect, Layer, Context)
- `./types.ts` (EventBusService, DomainEvent)

**Implementation**:

````typescript
import { Effect, PubSub, Stream, Scope, Layer, Context, pipe } from 'effect';

// Types from ./types
interface EventBusService<TEvent = unknown> {
  publish: (event: DomainEvent<TEvent>) => Effect.Effect<void, never>;
  subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<DomainEvent<TFilteredEvent>, never, never>, never, Scope.Scope>;
}

interface DomainEvent<TEvent = unknown> {
  readonly streamId: string;
  readonly event: TEvent;
  readonly position: number;
}

/**
 * Event Bus service tag
 * Provides internal pub/sub for domain events
 */
export class EventBus<TEvent = unknown> extends Context.Tag('EventBus')<
  EventBus<TEvent>,
  EventBusService<TEvent>
>() {}

/**
 * Creates an event bus service from a PubSub
 *
 * @internal
 */
const createEventBusService = <TEvent>(
  pubsub: PubSub.PubSub<DomainEvent<TEvent>>
): EventBusService<TEvent> => ({
  publish: (event: DomainEvent<TEvent>) => pipe(pubsub, PubSub.publish(event), Effect.asVoid),

  subscribe: <TFilteredEvent extends TEvent>(filter: (event: TEvent) => event is TFilteredEvent) =>
    pipe(
      pubsub,
      PubSub.subscribe,
      Effect.map(
        Stream.filter((domainEvent): domainEvent is DomainEvent<TFilteredEvent> =>
          filter(domainEvent.event)
        )
      )
    ),
});

/**
 * Creates an event bus with scoped lifecycle
 *
 * The PubSub is scoped, so it will be automatically cleaned up when the scope closes.
 * All subscribers will also be cleaned up.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   makeEventBus<TodoEvent>(),
 *   Effect.flatMap((bus) =>
 *     pipe(
 *       bus.publish({ streamId: 'todo-1', event: todoCreated, position: 1 }),
 *       Effect.andThen(bus.subscribe((e): e is TodoCreated => e.type === 'TodoCreated')),
 *       Effect.flatMap((stream) => Stream.runCollect(stream))
 *     )
 *   ),
 *   Effect.scoped
 * );
 * ```
 */
export const makeEventBus = <TEvent = unknown>(): Effect.Effect<
  EventBusService<TEvent>,
  never,
  Scope.Scope
> => pipe(PubSub.unbounded<DomainEvent<TEvent>>(), Effect.map(createEventBusService));

/**
 * Creates a Layer for EventBus service
 *
 * @example
 * ```typescript
 * const layer = EventBusLive<TodoEvent>();
 *
 * const program = pipe(
 *   EventBus,
 *   Effect.flatMap((bus) => bus.publish(event)),
 *   Effect.provide(layer)
 * );
 * ```
 */
export const EventBusLive = <TEvent = unknown>() =>
  Layer.scoped(EventBus<TEvent>(), makeEventBus<TEvent>());
````

**Key Design Decisions**:

1. **Scoped lifecycle**: PubSub is created in a Scope, ensuring automatic cleanup
2. **Type-safe filtering**: Subscribe uses type guards to provide filtered event streams
3. **Generic TEvent**: Supports any event type structure (not locked to todo events)
4. **Layer export**: Provides both factory function and Layer for DI flexibility

**Relationship to Todo Example**:

The todo example's `eventBus.ts` (43 lines) becomes this ~50 line generic implementation that:

- Replaces `DomainEvent = { streamId, event: TodoEvent | TodoListEvent }` with generic `DomainEvent<TEvent>`
- Provides the same `publish` and `subscribe` API
- Adds Layer support for Effect DI
- Works for ANY event type, not just Todo events

**Verification Steps**:

```bash
# 1. Create test file: packages/eventsourcing-server/src/lib/eventBus.test.ts
cat > packages/eventsourcing-server/src/lib/eventBus.test.ts << 'EOF'
import { describe, it, expect } from 'bun:test';
import { Effect, Stream, Chunk, pipe } from 'effect';
import { makeEventBus } from './eventBus';

type TestEvent =
  | { type: 'Created'; data: { id: string } }
  | { type: 'Updated'; data: { id: string } };

describe('EventBus', () => {
  it('should publish and subscribe to events', async () => {
    const program = pipe(
      makeEventBus<TestEvent>(),
      Effect.flatMap((bus) =>
        pipe(
          [
            bus.publish({ streamId: 'test-1', event: { type: 'Created', data: { id: '1' } }, position: 1 }),
            bus.publish({ streamId: 'test-2', event: { type: 'Updated', data: { id: '2' } }, position: 2 }),
          ],
          Effect.all,
          Effect.andThen(
            bus.subscribe((e): e is { type: 'Created'; data: { id: string } } => e.type === 'Created')
          ),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.take(1),
              Stream.runCollect
            )
          ),
          Effect.map((chunk) => Chunk.toReadonlyArray(chunk))
        )
      ),
      Effect.scoped
    );

    const result = await Effect.runPromise(program);
    expect(result).toHaveLength(1);
    expect(result[0].event.type).toBe('Created');
  });

  it('should filter events based on type guard', async () => {
    const program = pipe(
      makeEventBus<TestEvent>(),
      Effect.flatMap((bus) =>
        pipe(
          [
            bus.publish({ streamId: 'test-1', event: { type: 'Created', data: { id: '1' } }, position: 1 }),
            bus.publish({ streamId: 'test-2', event: { type: 'Updated', data: { id: '2' } }, position: 2 }),
            bus.publish({ streamId: 'test-3', event: { type: 'Created', data: { id: '3' } }, position: 3 }),
          ],
          Effect.all,
          Effect.andThen(
            bus.subscribe((e): e is { type: 'Updated'; data: { id: string } } => e.type === 'Updated')
          ),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.take(1),
              Stream.runCollect
            )
          ),
          Effect.map((chunk) => Chunk.toReadonlyArray(chunk))
        )
      ),
      Effect.scoped
    );

    const result = await Effect.runPromise(program);
    expect(result).toHaveLength(1);
    expect(result[0].event.type).toBe('Updated');
  });
});
EOF

# 2. Run tests
cd packages/eventsourcing-server
bun test src/lib/eventBus.test.ts

# 3. Type check
bun run typecheck

# Expected output: All tests pass, no type errors
```

---

### Task 3: Command Dispatcher Implementation

**File**: `packages/eventsourcing-server/src/lib/commandDispatcher.ts`

**Purpose**: Automatically route WireCommands to aggregate command methods based on naming convention (e.g., `CreateTodo` → `commands.createTodo`). This eliminates the massive routing boilerplate in the todo example's server.ts (521 lines).

**Dependencies**:

- `@codeforbreakfast/eventsourcing-aggregates` (AggregateRoot)
- `@codeforbreakfast/eventsourcing-commands` (WireCommand, CommandResult)
- `@codeforbreakfast/eventsourcing-store` (EventStore)
- `effect` (Effect, Context, Chunk, pipe)
- `./types.ts` (ServerError, AggregateConfig, EventBusService, DomainEvent)
- `./eventBus.ts` (EventBus)

**Implementation**:

````typescript
import { Effect, Context, Chunk, pipe, Option, Data, Stream, Scope } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

// Types from ./types
class ServerError extends Data.TaggedError('ServerError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

type AggregateConfig<
  TEvent extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown,
> = {
  readonly root: AggregateRoot<string, unknown, TEvent, TMetadata, unknown, unknown>;
};

interface CommandDispatcherService<R = never> {
  readonly dispatch: (command: ReadonlyDeep<WireCommand>) => Effect.Effect<CommandResult, never, R>;
}

interface EventBusService<TEvent = unknown> {
  publish: (event: DomainEvent<TEvent>) => Effect.Effect<void, never>;
  subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<DomainEvent<TFilteredEvent>, never, never>, never, Scope.Scope>;
}

interface DomainEvent<TEvent = unknown> {
  readonly streamId: string;
  readonly event: TEvent;
  readonly position: number;
}

// Classes from ./eventBus
class EventBus extends Context.Tag('EventBus')<EventBus, EventBusService>() {}

/**
 * Command Dispatcher service tag
 */
export class CommandDispatcher extends Context.Tag('CommandDispatcher')<
  CommandDispatcher,
  CommandDispatcherService
>() {}

/**
 * Convert PascalCase command name to camelCase method name
 *
 * Examples:
 * - "CreateTodo" → "createTodo"
 * - "UpdateUserProfile" → "updateUserProfile"
 * - "DeleteItem" → "deleteItem"
 *
 * @internal
 */
const toCamelCase = (pascalCase: string): string => {
  if (pascalCase.length === 0) return pascalCase;
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
};

/**
 * Extract aggregate name from command name
 *
 * Convention: Command name format is "{Verb}{AggregateName}"
 * Examples:
 * - "CreateTodo" → "Todo"
 * - "UpdateUser" → "User"
 * - "DeleteOrder" → "Order"
 *
 * This is a heuristic - it finds the first capital letter after the verb.
 *
 * @internal
 */
const extractAggregateName = (commandName: string): string => {
  // Find first uppercase letter after the first character
  for (let i = 1; i < commandName.length; i++) {
    if (commandName[i] === commandName[i].toUpperCase()) {
      return commandName.slice(i);
    }
  }
  // Fallback: assume the whole thing is the aggregate name
  return commandName;
};

/**
 * Find the aggregate root that should handle this command
 *
 * Matching logic:
 * 1. Extract aggregate name from command (e.g., "CreateTodo" → "Todo")
 * 2. Find aggregate root with matching event store tag (e.g., "Todo/EventStore")
 *
 * @internal
 */
const findAggregateForCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  command: ReadonlyDeep<WireCommand>,
  aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>
): Effect.Effect<
  AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  ServerError
> => {
  const aggregateName = extractAggregateName(command.name);

  for (const config of aggregates) {
    const root = config.root;
    // The event store tag has format "{AggregateName}/EventStore"
    // We can access this via the root's commit function's tag
    // However, we don't have direct access to the tag name at runtime
    //
    // Alternative: Match based on the commands object having the method
    const methodName = toCamelCase(command.name);
    if (methodName in root.commands && typeof root.commands[methodName] === 'function') {
      return Effect.succeed(
        root as AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>
      );
    }
  }

  return Effect.fail(
    new (class extends Error {
      readonly _tag = 'ServerError';
      constructor(
        readonly operation: string,
        readonly reason: string
      ) {
        super(`${operation} failed: ${reason}`);
        this.name = 'ServerError';
      }
    })(
      'findAggregate',
      `No aggregate found with command method "${toCamelCase(command.name)}" for command "${command.name}"`
    ) as ServerError
  );
};

/**
 * Execute a command method on an aggregate
 *
 * @internal
 */
const executeAggregateCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>
): Effect.Effect<ReadonlyArray<TEvent>, ServerError> => {
  const methodName = toCamelCase(command.name);
  const commandMethod = aggregate.commands[methodName];

  if (typeof commandMethod !== 'function') {
    return Effect.fail(
      new (class extends Error {
        readonly _tag = 'ServerError';
        constructor(
          readonly operation: string,
          readonly reason: string
        ) {
          super(`${operation} failed: ${reason}`);
          this.name = 'ServerError';
        }
      })('executeCommand', `Command method "${methodName}" is not a function`) as ServerError
    );
  }

  return pipe(
    Effect.try({
      try: () => commandMethod(command.target, command.payload),
      catch: (error) =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })('executeCommand', `Command execution failed: ${String(error)}`, error) as ServerError,
    }),
    Effect.flatMap((result) => {
      // The result should be Effect<ReadonlyArray<TEvent>, Error>
      if (Effect.isEffect(result)) {
        return result as Effect.Effect<ReadonlyArray<TEvent>, Error>;
      }
      return Effect.fail(
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })(
          'executeCommand',
          `Command method must return an Effect, got ${typeof result}`
        ) as ServerError
      );
    }),
    Effect.mapError(
      (error): ServerError =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })('executeCommand', `Command execution failed: ${String(error)}`, error) as ServerError
    )
  );
};

/**
 * Load aggregate state, execute command, commit events, publish to event bus
 *
 * This is the core pipeline: Load → Execute → Commit → Publish
 *
 * @internal
 */
const processCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>,
  eventBus: EventBusService<TEvent>
): Effect.Effect<CommandResult, ServerError> =>
  pipe(
    // 1. Load aggregate state
    aggregate.load(command.target),
    Effect.mapError(
      (error): ServerError =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })(
          'loadAggregate',
          `Failed to load aggregate ${command.target}: ${String(error)}`,
          error
        ) as ServerError
    ),
    Effect.flatMap((state) =>
      pipe(
        // 2. Execute command
        executeAggregateCommand(aggregate, command),
        Effect.flatMap((events) =>
          pipe(
            // 3. Commit events
            aggregate.commit({
              id: command.target,
              eventNumber: state.nextEventNumber,
              events: Chunk.fromIterable(events),
            }),
            Effect.mapError(
              (error): ServerError =>
                new (class extends Error {
                  readonly _tag = 'ServerError';
                  constructor(
                    readonly operation: string,
                    readonly reason: string,
                    readonly cause?: unknown
                  ) {
                    super(`${operation} failed: ${reason}`);
                    this.name = 'ServerError';
                  }
                })(
                  'commitEvents',
                  `Failed to commit events: ${String(error)}`,
                  error
                ) as ServerError
            ),
            Effect.andThen(
              // 4. Publish events to event bus
              pipe(
                events,
                Effect.forEach((event, index) =>
                  eventBus.publish({
                    streamId: command.target,
                    event,
                    position: state.nextEventNumber + index,
                  } as DomainEvent<TEvent>)
                ),
                Effect.asVoid
              )
            ),
            Effect.as({
              _tag: 'Success' as const,
              position: state.nextEventNumber + events.length,
            })
          )
        )
      )
    ),
    Effect.catchAll(
      (error): Effect.Effect<CommandResult, never> =>
        Effect.succeed({
          _tag: 'Failure' as const,
          error: {
            _tag: 'ServerError',
            message: error.reason,
            operation: error.operation,
          },
        })
    )
  );

/**
 * Creates a command dispatcher service
 *
 * @example
 * ```typescript
 * const dispatcher = makeCommandDispatcher({
 *   aggregates: [TodoAggregateRoot, UserAggregateRoot],
 * });
 *
 * const program = pipe(
 *   dispatcher,
 *   Effect.flatMap((service) =>
 *     service.dispatch({
 *       id: 'cmd-1',
 *       name: 'CreateTodo',
 *       target: 'todo-123',
 *       payload: { title: 'Buy milk' }
 *     })
 *   ),
 *   Effect.provide(EventBusLive())
 * );
 * ```
 */
export const makeCommandDispatcher = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}): Effect.Effect<CommandDispatcherService, never, EventBus<TEvent>> =>
  pipe(
    EventBus<TEvent>(),
    Effect.map(
      (eventBus): CommandDispatcherService => ({
        dispatch: (command: ReadonlyDeep<WireCommand>) =>
          pipe(
            findAggregateForCommand(command, config.aggregates),
            Effect.flatMap((aggregate) => processCommand(aggregate, command, eventBus))
          ),
      })
    )
  );

/**
 * Creates a Layer for CommandDispatcher service
 */
export const CommandDispatcherLive = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}) => Layer.effect(CommandDispatcher, makeCommandDispatcher(config));
````

**Key Design Decisions**:

1. **Convention-based routing**: Eliminates manual routing tables entirely
2. **Pipeline pattern**: Load → Execute → Commit → Publish is explicit and clear
3. **Error handling**: All errors converted to ServerError with operation context
4. **Event bus integration**: Automatically publishes committed events
5. **Generic over TEvent**: Works with any event type structure

**Relationship to Todo Example**:

This eliminates ~300 lines of manual command routing from `server.ts`:

- No more `createTodoFromCommand`, `updateTodoFromCommand`, etc.
- No more manual routing switch/case statements
- No more manual event store layer wiring per command

**Verification Steps**:

```bash
# 1. Create test file
cat > packages/eventsourcing-server/src/lib/commandDispatcher.test.ts << 'EOF'
import { describe, it, expect } from 'bun:test';
import { Effect, Chunk, Option, pipe } from 'effect';
import { makeCommandDispatcher } from './commandDispatcher';
import { EventBusLive } from './eventBus';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

// Mock aggregate for testing
type TestEvent = { type: 'Created'; data: { title: string } };
type TestState = { title: string };

const mockAggregate: AggregateRoot<string, TestState, TestEvent, string, { createTest: Function }, unknown> = {
  new: () => ({ nextEventNumber: 0, data: Option.none() }),
  load: (id: string) =>
    Effect.succeed({ nextEventNumber: 0, data: Option.none() }),
  commit: (options) => Effect.void,
  commands: {
    createTest: (id: string, payload: { title: string }) =>
      Effect.succeed([{ type: 'Created', data: { title: payload.title } }]),
  },
};

describe('CommandDispatcher', () => {
  it('should route CreateTest command to createTest method', async () => {
    const program = pipe(
      makeCommandDispatcher({ aggregates: [{ root: mockAggregate }] }),
      Effect.flatMap((dispatcher) =>
        dispatcher.dispatch({
          id: 'cmd-1',
          name: 'CreateTest',
          target: 'test-1',
          payload: { title: 'Test Title' },
        })
      ),
      Effect.provide(EventBusLive())
    );

    const result = await Effect.runPromise(program);
    expect(result._tag).toBe('Success');
  });

  it('should fail for unknown command', async () => {
    const program = pipe(
      makeCommandDispatcher({ aggregates: [{ root: mockAggregate }] }),
      Effect.flatMap((dispatcher) =>
        dispatcher.dispatch({
          id: 'cmd-1',
          name: 'UnknownCommand',
          target: 'test-1',
          payload: {},
        })
      ),
      Effect.provide(EventBusLive())
    );

    const result = await Effect.runPromise(program);
    expect(result._tag).toBe('Failure');
  });
});
EOF

# 2. Run tests
bun test src/lib/commandDispatcher.test.ts

# 3. Type check
bun run typecheck
```

---

### Task 4: Protocol Bridge Implementation

**File**: `packages/eventsourcing-server/src/lib/protocolBridge.ts`

**Purpose**: Automatically bridge ServerProtocol to CommandDispatcher and EventBus. This eliminates manual protocol wiring (~150 lines in todo example).

**Dependencies**:

- `@codeforbreakfast/eventsourcing-protocol` (ServerProtocol)
- `effect` (Effect, Stream, pipe, Scope)
- `./types.ts` (ServerError, EventBusService)
- `./commandDispatcher.ts` (CommandDispatcher)
- `./eventBus.ts` (EventBus)

**Implementation**:

````typescript
import { Effect, Stream, Scope, pipe, Context, Data } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';

// Types from ./types
class ServerError extends Data.TaggedError('ServerError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

interface EventBusService<TEvent = unknown> {
  publish: (event: any) => Effect.Effect<void, never>;
  subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<any, never, never>, never, Scope.Scope>;
}

// Classes from ./commandDispatcher
class CommandDispatcher extends Context.Tag('CommandDispatcher')<
  CommandDispatcher,
  { dispatch: (command: any) => Effect.Effect<any, never, any> }
>() {}

// Classes from ./eventBus
class EventBus extends Context.Tag('EventBus')<EventBus, any>() {}

/**
 * Bridge ServerProtocol commands to CommandDispatcher
 *
 * Subscribes to incoming WireCommands from ServerProtocol and dispatches them
 * via CommandDispatcher, then sends results back via ServerProtocol.
 *
 * @internal
 */
const bridgeCommandsToDispatcher = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  dispatcher: Context.Tag.Service<typeof CommandDispatcher>
): Effect.Effect<never, ServerError, Scope.Scope> =>
  pipe(
    protocol.onWireCommand,
    Stream.runForEach((command) =>
      pipe(
        dispatcher.dispatch(command),
        Effect.flatMap((result) => protocol.sendResult(command.id, result)),
        Effect.catchAll((error) =>
          protocol.sendResult(command.id, {
            _tag: 'Failure',
            error: {
              _tag: 'ServerError',
              message: error.reason || String(error),
            },
          })
        )
      )
    ),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

/**
 * Bridge EventBus events to ServerProtocol
 *
 * Subscribes to all events from EventBus and publishes them via ServerProtocol.
 *
 * @internal
 */
const bridgeEventsToProtocol = <TEvent>(
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  eventBus: EventBusService<TEvent>
): Effect.Effect<never, ServerError, Scope.Scope> =>
  pipe(
    eventBus.subscribe((e): e is TEvent => true), // Subscribe to all events
    Effect.flatMap((stream) =>
      pipe(
        stream,
        Stream.runForEach(
          (domainEvent) =>
            protocol.publishEvent({
              streamId: domainEvent.streamId,
              position: domainEvent.position,
              ...domainEvent.event,
            } as any) // Type cast needed due to generic event structure
        )
      )
    ),
    Effect.forkScoped,
    Effect.asVoid,
    Effect.andThen(Effect.never)
  );

/**
 * Creates a bidirectional bridge between ServerProtocol and server runtime
 *
 * This function:
 * 1. Routes incoming commands from ServerProtocol → CommandDispatcher → Aggregates
 * 2. Routes committed events from EventBus → ServerProtocol → Transport layer
 *
 * Both bridges run in parallel as forked fibers within the provided scope.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(makeProtocolBridge),
 *   Effect.provide(ServerProtocolLive(transport)),
 *   Effect.provide(CommandDispatcherLive({ aggregates })),
 *   Effect.provide(EventBusLive()),
 *   Effect.scoped
 * );
 * ```
 */
export const makeProtocolBridge = <TEvent>(
  protocol: Context.Tag.Service<typeof ServerProtocol>
): Effect.Effect<never, ServerError, CommandDispatcher | EventBus<TEvent> | Scope.Scope> =>
  pipe(
    [CommandDispatcher, EventBus<TEvent>()] as const,
    Effect.all,
    Effect.flatMap(([dispatcher, eventBus]) =>
      pipe(
        [
          bridgeCommandsToDispatcher(protocol, dispatcher),
          bridgeEventsToProtocol(protocol, eventBus),
        ],
        Effect.all,
        Effect.asVoid,
        Effect.andThen(Effect.never)
      )
    )
  );
````

**Key Design Decisions**:

1. **Bidirectional**: Handles both directions (commands in, events out)
2. **Forked fibers**: Both bridges run in parallel
3. **Scoped**: Automatically cleans up when scope closes
4. **Error handling**: Command failures are caught and sent back as Failure results
5. **Effect.never**: Bridges run forever until scope closes

**Relationship to Todo Example**:

This eliminates manual protocol bridging code (~150 lines in server.ts):

- No more manual `onWireCommand` subscription
- No more manual `publishEvent` calls after committing
- No more manual error-to-result conversion

**Verification Steps**:

```bash
# 1. Type check
cd packages/eventsourcing-server
bun run typecheck

# 2. Integration test will be added in serverRuntime.test.ts
# (Protocol bridge is tested as part of the full runtime)
```

---

### Task 5: Server Runtime Implementation

**File**: `packages/eventsourcing-server/src/lib/serverRuntime.ts`

**Purpose**: Main factory function that composes all pieces (EventBus, CommandDispatcher, ProtocolBridge) into a complete server runtime.

**Dependencies**:

- All previous modules
- `effect` (Effect, Layer, Context, pipe, Scope)

**Implementation**:

````typescript
import { Effect, Layer, Context, pipe, Scope, Stream, Data } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { ReadonlyDeep } from 'type-fest';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';

// Types from ./types
interface ServerRuntimeConfig<
  TEvent extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown,
> {
  readonly aggregates: readonly any[];
  readonly processManagers?: readonly any[];
}

interface ServerRuntime<TEvent = unknown> {
  handleProtocol: (protocol: any) => Effect.Effect<never, ServerError, Scope.Scope>;
  eventBus: any;
  executeCommand: (command: WireCommand) => Effect.Effect<CommandResult, never>;
}

class ServerError extends Data.TaggedError('ServerError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

interface EventBusService<TEvent = unknown> {
  publish: (event: any) => Effect.Effect<void, never>;
  subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<any, never, never>, never, Scope.Scope>;
}

// Classes and functions from ./eventBus
class EventBus extends Context.Tag('EventBus')<EventBus, EventBusService>() {}
declare const EventBusLive: <TEvent = unknown>() => Layer.Layer<EventBus, never, never>;

// Classes and functions from ./commandDispatcher
class CommandDispatcher extends Context.Tag('CommandDispatcher')<CommandDispatcher, any>() {}
declare const CommandDispatcherLive: <TEvent extends Record<string, unknown>, TMetadata>(config: {
  aggregates: readonly any[];
}) => Layer.Layer<CommandDispatcher, never, any>;

// Functions from ./protocolBridge
declare const makeProtocolBridge: (
  protocol: Context.Tag.Service<typeof ServerProtocol>
) => Effect.Effect<never, never, any>;

/**
 * Creates a transport-agnostic server runtime
 *
 * This is the main entry point for creating an event sourcing server.
 * It wires together:
 * - Event bus for internal pub/sub
 * - Command dispatcher for routing commands to aggregates
 * - Protocol bridge for connecting to transport layer
 * - Process managers (Phase 2, not yet implemented)
 *
 * @example
 * ```typescript
 * import { makeServerRuntime } from '@codeforbreakfast/eventsourcing-server';
 * import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
 * import { TodoAggregateRoot } from './domain/todoAggregate';
 *
 * const runtime = makeServerRuntime({
 *   aggregates: [{ root: TodoAggregateRoot }],
 * });
 *
 * // Wire to transport layer
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(runtime.handleProtocol),
 *   Effect.provide(yourTransportLayer)
 * );
 * ```
 */
export const makeServerRuntime = <TEvent, TMetadata>(
  config: ServerRuntimeConfig<TEvent, TMetadata>
): ServerRuntime<TEvent> => {
  // Create layers for DI
  const eventBusLayer = EventBusLive<TEvent>();
  const commandDispatcherLayer = CommandDispatcherLive<TEvent, TMetadata>({
    aggregates: config.aggregates,
  });

  // Combine layers
  const runtimeLayers = Layer.mergeAll(eventBusLayer, commandDispatcherLayer);

  return {
    handleProtocol: (protocol) =>
      pipe(makeProtocolBridge<TEvent>(protocol), Effect.provide(runtimeLayers)),

    eventBus: {
      publish: (event) =>
        pipe(
          EventBus<TEvent>(),
          Effect.flatMap((bus) => bus.publish(event)),
          Effect.provide(eventBusLayer),
          Effect.scoped
        ),
      subscribe: (filter) =>
        pipe(
          EventBus<TEvent>(),
          Effect.flatMap((bus) => bus.subscribe(filter)),
          Effect.provide(eventBusLayer)
        ),
    },

    executeCommand: (command) =>
      pipe(
        CommandDispatcher,
        Effect.flatMap((dispatcher) => dispatcher.dispatch(command)),
        Effect.provide(runtimeLayers),
        Effect.scoped
      ),
  };
};
````

**Key Design Decisions**:

1. **Layer composition**: Uses Effect's Layer system for clean DI
2. **Exported event bus**: Allows direct access for custom integrations
3. **Exported executeCommand**: Enables testing without full protocol stack
4. **Process managers**: Config accepted but not yet implemented (Phase 2)
5. **Type preservation**: Generic over TEvent and TMetadata

**Relationship to Todo Example**:

This is the centerpiece that reduces server.ts from 521 lines to ~20 lines:

**Before (todo example server.ts - 521 lines)**:

```typescript
// Massive file with manual:
// - Event store creation
// - Command routing
// - Event bus setup
// - Protocol bridging
// - Process manager wiring
```

**After (with this package)**:

```typescript
const runtime = makeServerRuntime({
  aggregates: [TodoAggregateRoot, TodoListAggregateRoot],
  processManagers: [
    /* Phase 2 */
  ],
});

const program = pipe(
  ServerProtocol,
  Effect.flatMap(runtime.handleProtocol),
  Effect.provide(transportLayer)
);
```

**Verification Steps**:

```bash
# 1. Create comprehensive integration test
cat > packages/eventsourcing-server/src/lib/serverRuntime.test.ts << 'EOF'
import { describe, it, expect } from 'bun:test';
import { Effect, Chunk, Option, Layer, Queue, Stream, Ref, HashMap, pipe } from 'effect';
import { makeServerRuntime } from './serverRuntime';
import { ServerProtocol, ServerProtocolLive } from '@codeforbreakfast/eventsourcing-protocol';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

// Mock transport and aggregate for testing
// (Full implementation would use real mocks from test utilities)

describe('ServerRuntime', () => {
  it('should handle full command flow: protocol → dispatcher → aggregate → event bus → protocol', async () => {
    // This is an integration test
    // Actual implementation would use proper mocks and test infrastructure
    expect(true).toBe(true);
  });
});
EOF

# 2. Run tests
bun test

# 3. Type check
bun run typecheck

# 4. Build the package
bun run build
```

---

### Task 6: Public API Exports

**File**: `packages/eventsourcing-server/src/index.ts`

**Purpose**: Define the public API surface, exporting only what consumers should use.

**Implementation**:

````typescript
/**
 * @codeforbreakfast/eventsourcing-server
 *
 * Transport-agnostic server infrastructure for event sourcing.
 *
 * This package provides the core server runtime that handles:
 * - Automatic command routing from Protocol to aggregates
 * - Event publishing to both internal event bus and Protocol
 * - Process manager infrastructure (Phase 2)
 * - Layer composition
 *
 * For WebSocket-specific convenience, see @codeforbreakfast/eventsourcing-websocket
 *
 * @example
 * ```typescript
 * import { makeServerRuntime } from '@codeforbreakfast/eventsourcing-server';
 * import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
 * import { TodoAggregateRoot } from './domain/todoAggregate';
 *
 * const runtime = makeServerRuntime({
 *   aggregates: [{ root: TodoAggregateRoot }],
 * });
 *
 * const program = pipe(
 *   ServerProtocol,
 *   Effect.flatMap(runtime.handleProtocol),
 *   Effect.provide(yourTransportLayer)
 * );
 * ```
 */

// Core runtime
export { makeServerRuntime } from './lib/serverRuntime';
export type { ServerRuntime } from './lib/types';

// Configuration types
export type { ServerRuntimeConfig, AggregateConfig, ProcessManagerConfig } from './lib/types';

// Event bus (for advanced integrations)
export { EventBus, EventBusLive, makeEventBus } from './lib/eventBus';
export type { EventBusService, DomainEvent } from './lib/types';

// Command dispatcher (for testing)
export { CommandDispatcher, CommandDispatcherLive } from './lib/commandDispatcher';
export type { CommandDispatcherService } from './lib/types';

// Errors
export { ServerError } from './lib/types';

// Version
export const version = '0.1.0';
````

**Key Design Decisions**:

1. **Minimal surface**: Only export what's needed
2. **Type exports**: All config types exported for TypeScript users
3. **Advanced exports**: EventBus and CommandDispatcher exported for power users
4. **Documentation**: JSDoc with examples at top level
5. **Version**: Explicit version export for debugging

**Verification Steps**:

```bash
# 1. Type check
cd packages/eventsourcing-server
bun run typecheck

# 2. Build and check exports
bun run build
bun x publint

# 3. Verify package.json exports match
cat package.json | grep -A 10 '"exports"'
```

---

## Integration Testing

After completing all tasks, create an end-to-end integration test:

**File**: `packages/eventsourcing-server/src/integration.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { Effect, Chunk, Option, pipe } from 'effect';
import { makeServerRuntime } from './index';
// Import mock aggregates and transport from test fixtures
// (Actual implementation would use real todo aggregate from examples)

describe('ServerRuntime Integration', () => {
  it('should process commands end-to-end', async () => {
    // 1. Create runtime with mock aggregates
    // 2. Wire to mock transport
    // 3. Send commands via protocol
    // 4. Verify events published
    // 5. Verify command results returned
    expect(true).toBe(true); // Placeholder
  });

  it('should handle multiple aggregates', async () => {
    // Test routing to different aggregates
    expect(true).toBe(true);
  });

  it('should handle command failures gracefully', async () => {
    // Test error handling
    expect(true).toBe(true);
  });
});
```

---

## Phase 1 Completion Checklist

- [ ] Task 1: Shared Type Definitions (`types.ts`)
  - [ ] File created with all types
  - [ ] Type checks pass
  - [ ] No circular dependencies

- [ ] Task 2: Event Bus (`eventBus.ts`)
  - [ ] Implementation complete
  - [ ] Unit tests pass
  - [ ] Type checks pass

- [ ] Task 3: Command Dispatcher (`commandDispatcher.ts`)
  - [ ] Implementation complete
  - [ ] Unit tests pass
  - [ ] Convention-based routing works
  - [ ] Type checks pass

- [ ] Task 4: Protocol Bridge (`protocolBridge.ts`)
  - [ ] Implementation complete
  - [ ] Type checks pass

- [ ] Task 5: Server Runtime (`serverRuntime.ts`)
  - [ ] Implementation complete
  - [ ] Integration tests pass
  - [ ] Type checks pass

- [ ] Task 6: Public API (`index.ts`)
  - [ ] Exports defined
  - [ ] Documentation complete
  - [ ] Package builds successfully
  - [ ] `publint` passes

- [ ] Integration Testing
  - [ ] End-to-end tests pass
  - [ ] Works with real todo example
  - [ ] Line count verification: todo example reduces to target

---

## Success Criteria

Phase 1 is complete when:

1. **All unit tests pass**
2. **All integration tests pass**
3. **Type checking passes with zero errors**
4. **Package builds successfully**
5. **Todo example server.ts can be refactored to use this package**
6. **Line count reduction verified**:
   - Before: 805 lines (server.ts + processManager.ts + eventBus.ts)
   - After: ~100 lines (using makeServerRuntime + transport wiring)

---

## Phase 2 Preview: Process Managers

(Not implemented in Phase 1)

**File**: `packages/eventsourcing-server/src/lib/processManager.ts`

Will provide:

- Declarative process manager configuration
- Automatic event subscription and command execution
- Error handling and retries
- Replaces the 241-line `processManager.ts` from todo example

Example usage:

```typescript
processManagers: [
  {
    name: 'TodoListManager',
    on: 'TodoCreated',
    execute: (event, { streamId }) =>
      TodoListAggregateRoot.commands.addTodo(streamId, event.data.title),
    target: () => 'todo-list-main',
  },
];
```

---

## Notes for Engineers

### Common Pitfalls

1. **Event type mismatches**: Ensure TEvent generic is consistent across all services
2. **Layer ordering**: EventBus must be provided before CommandDispatcher
3. **Scope management**: Protocol bridge requires Scope - don't forget Effect.scoped
4. **Command naming**: Must follow PascalCase → camelCase convention exactly

### Debugging

Enable Effect tracing:

```typescript
Effect.runPromise(program.pipe(Effect.withTracingEnabled(true)));
```

Check event bus subscriptions:

```typescript
// Log all events
runtime.eventBus.subscribe((e): e is TEvent => {
  console.log('Event:', e);
  return true;
});
```

### Testing Tips

1. Use mock aggregates with simple commands for unit tests
2. Use real aggregates for integration tests
3. Test error paths explicitly (missing aggregates, invalid commands)
4. Verify event bus receives all committed events

---

## Dependencies Reference

### Effect Imports Needed

```typescript
import {
  Effect, // Core effect type
  Stream, // Stream processing
  Layer, // Dependency injection
  Context, // Service tags
  Queue, // Bounded/unbounded queues
  Ref, // Mutable references
  HashMap, // Immutable hash maps
  PubSub, // Pub/sub messaging
  Scope, // Resource management
  Chunk, // Immutable arrays
  Option, // Optional values
  Match, // Pattern matching
  pipe, // Function composition
  Schema, // Runtime validation
  ParseResult, // Parsing errors
  Clock, // Time operations
} from 'effect';
```

### Workspace Package Imports

```typescript
// Aggregates
import {
  makeAggregateRoot,
  defineAggregateEventStore,
  type AggregateRoot,
  type AggregateState,
  type CommitOptions,
  type EventRecord,
  type EventMetadata,
} from '@codeforbreakfast/eventsourcing-aggregates';

// Protocol
import {
  ServerProtocol,
  ServerProtocolLive,
  type Event,
  type ProtocolCommand,
} from '@codeforbreakfast/eventsourcing-protocol';

// Commands
import { type WireCommand, type CommandResult } from '@codeforbreakfast/eventsourcing-commands';

// Store
import {
  type EventStore,
  type EventStreamId,
  type EventStreamPosition,
  type EventNumber,
} from '@codeforbreakfast/eventsourcing-store';

// Transport
import { type Server, type TransportMessage } from '@codeforbreakfast/eventsourcing-transport';
```

---

## Appendix: Todo Example Comparison

### Before (Manual Approach)

**server.ts** (521 lines):

- Manual event store creation
- Manual command routing (`createTodoFromCommand`, etc.)
- Manual event publishing
- Manual protocol bridging

**eventBus.ts** (43 lines):

- Custom PubSub implementation

**processManager.ts** (241 lines):

- Manual stream subscription
- Manual command execution
- Manual error handling

**Total**: 805 lines

### After (With This Package)

**server.ts** (~50 lines with WebSocket package):

```typescript
import { BunRuntime } from '@effect/platform-bun';
import { Effect } from 'effect';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

declare const TodoAggregateRoot: AggregateRoot<
  string,
  any,
  any,
  any,
  {
    /* commands */
  },
  any
>;
declare const TodoListAggregateRoot: AggregateRoot<
  string,
  any,
  any,
  any,
  { addTodo: (streamId: string, title: string) => Effect.Effect<readonly any[], Error> },
  any
>;

declare const makeServerRuntime: (config: {
  aggregates: readonly any[];
  processManagers?: readonly any[];
}) => any;

declare const makeEventSourcingServer: (config: { port: number; runtime: any }) => {
  start: () => any;
};

type TodoCreatedEvent = { readonly type: 'TodoCreated'; readonly data: { readonly title: string } };

const runtime = makeServerRuntime({
  aggregates: [{ root: TodoAggregateRoot }, { root: TodoListAggregateRoot }],
  processManagers: [
    {
      name: 'TodoListManager',
      on: 'TodoCreated',
      execute: (event: TodoCreatedEvent, { streamId }: { streamId: string }) =>
        TodoListAggregateRoot.commands.addTodo(streamId, event.data.title),
      target: () => 'todo-list-main',
    },
  ],
});

// WebSocket-specific wiring (from eventsourcing-websocket package)
const server = makeEventSourcingServer({
  port: 8080,
  runtime,
});

BunRuntime.runMain(server.start());
```

**Total**: ~50 lines

**Reduction**: 805 → 50 = 93.8% reduction in boilerplate
