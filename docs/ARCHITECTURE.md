# Event Sourcing Architecture

## Overview

This event sourcing library is built on a **4-layer architecture** that enforces clear separation of concerns between domain logic, serialization, protocol implementation, and transport mechanisms.

## The 4 Layers

### Layer 1: Domain Layer

**Purpose**: Business logic and domain events with full type safety

**Key Characteristics**:

- Domain-specific event types (never `unknown` or generic `Event`)
- Strong typing throughout all domain logic
- Event unions specific to each aggregate or bounded context

**Packages**:

- `@codeforbreakfast/eventsourcing-aggregates` - Aggregate patterns for write-side
- `@codeforbreakfast/eventsourcing-projections` - Read-side projections
- `@codeforbreakfast/eventsourcing-store` - Event storage contracts

**Example**:

```typescript
// Domain-specific event union
const UserEvent = Schema.Union(UserCreated, UserUpdated, UserDeleted);
type UserEvent = typeof UserEvent.Type;

// Domain-specific event store
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
```

### Layer 2: Wire API Layer (PUBLIC)

**Purpose**: Public API for commands and events that cross system boundaries

**Key Characteristics**:

- Types prefixed with `Wire*` (e.g., `WireCommand`)
- Unvalidated payloads (`payload: unknown`)
- Public API contracts for external consumption

**Packages**:

- `@codeforbreakfast/eventsourcing-commands` - Command types and validation

**Types**:

- `WireCommand` - Command structure for transport/APIs

**Example**:

```typescript
interface WireCommand {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: unknown; // Unvalidated - will be validated against domain schemas
}
```

### Layer 3: Protocol Layer (INTERNAL)

**Purpose**: Internal message protocol for client-server communication

**Key Characteristics**:

- Types prefixed with `Protocol*` (e.g., `ProtocolCommand`)
- Adds protocol-specific envelopes and discriminators
- Internal implementation details - NOT for external use
- Message correlation, subscription management, timeout handling

**Packages**:

- `@codeforbreakfast/eventsourcing-protocol` - Protocol implementation

**Types**:

- `ProtocolCommand` - WireCommand + protocol discriminator
- `ProtocolCommandResult` - Command result with protocol metadata
- `ProtocolEvent` - Event with protocol envelope
- `ProtocolSubscribe` - Subscription message

**Example**:

```typescript
// ProtocolCommand wraps WireCommand with a type discriminator
const ProtocolCommand = Schema.Struct({
  type: Schema.Literal('command'), // Protocol discriminator
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
```

### Layer 4: Transport Layer

**Purpose**: Generic message delivery abstraction

**Key Characteristics**:

- Types prefixed with `Transport*` (e.g., `TransportMessage`)
- Protocol-agnostic - doesn't know about commands/events
- Handles connection management, message delivery

**Packages**:

- `@codeforbreakfast/eventsourcing-transport` - Transport contracts
- `@codeforbreakfast/eventsourcing-transport-websocket` - WebSocket implementation
- `@codeforbreakfast/eventsourcing-transport-inmemory` - In-memory implementation

## Layer Dependencies

```
Domain Layer (Layer 1)
    ↓ uses
Wire API Layer (Layer 2) ← PUBLIC API
    ↓ used by
Protocol Layer (Layer 3) ← INTERNAL
    ↓ uses
Transport Layer (Layer 4)
```

**Important Rules**:

- Layers can only depend on layers below them
- Layer 2 (Wire API) MUST NOT depend on Layer 3 (Protocol)
- Protocol types MUST NOT leak outside the protocol package
- Domain layer uses Wire types from Layer 2, never Protocol types from Layer 3

## Naming Conventions

### Type Prefixes

| Prefix       | Layer     | Visibility   | Example                   | Purpose                      |
| ------------ | --------- | ------------ | ------------------------- | ---------------------------- |
| (none)       | Domain    | Internal     | `UserEvent`, `OrderEvent` | Domain-specific types        |
| `Wire*`      | Wire API  | **PUBLIC**   | `WireCommand`             | Public API for serialization |
| `Protocol*`  | Protocol  | **INTERNAL** | `ProtocolCommand`         | Internal protocol envelopes  |
| `Transport*` | Transport | Internal     | `TransportMessage`        | Generic transport containers |

### Why These Prefixes?

**`Wire*`** - Indicates types that go "over the wire" - the public API boundary where type safety must be relaxed for serialization

**`Protocol*`** - Marks internal protocol implementation details that add message routing, correlation, and state management on top of the Wire API

**Domain types (no prefix)** - Stay in the strongly-typed domain layer and should never cross serialization boundaries without validation

## Type Safety Principles

### 1. Domain Events Are Always Specific

**Never use generic `Event` or `unknown` types in domain logic.**

```typescript
// ❌ WRONG - Generic Event with unknown data
const EventStoreService = EventStoreTag<Event>();
const handler: CommandHandler = {
  execute: () => Effect.succeed([{ type: 'UserCreated', data: { name: 'John' } } as Event]),
};

// ✅ CORRECT - Domain-specific event union
const UserEvent = Schema.Union(UserCreated, UserUpdated, UserDeleted);
type UserEvent = typeof UserEvent.Type;

const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);

const handler: CommandHandler<UserEvent> = {
  execute: () =>
    Effect.succeed([{ type: 'UserCreated', data: { name: 'John', email: 'john@example.com' } }]),
};
```

### 2. The Generic `Event` Type is for Serialization Boundaries Only

The generic `Event` type in `@codeforbreakfast/eventsourcing-store` exists for storage/wire boundaries:

```typescript
export const Event = Schema.Struct({
  position: EventStreamPosition,
  type: Schema.String,
  data: Schema.Unknown, // Generic - for wire/storage only
  timestamp: Schema.Date,
});
```

This type serves two purposes:

1. **Runtime validation** at storage/network boundaries
2. **Wire protocol** for events crossing system boundaries

It should **never** appear in domain logic, command handlers, or aggregate roots.

### 3. EventStore Services Are Domain-Specific

Each aggregate or bounded context creates its own event store tag with its specific event union:

```typescript
// Define domain events
const UserEvent = Schema.Union(UserCreated, UserUpdated);
type UserEvent = typeof UserEvent.Type;

// Create domain-specific event store tag
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
```

### 4. Transformation Happens at Boundaries

Storage implementations handle transformation between domain events and the generic `Event` type:

```typescript
// In event store implementation
export const makePostgresEventStore = <TEvent>(
  schema: Schema.Schema<TEvent, unknown>
): EventStore<TEvent> => ({
  append: (position) =>
    Sink.mapInputEffect((event: TEvent) =>
      pipe(
        // Encode domain event to storage Event
        event,
        Schema.encode(schema),
        Effect.map((encoded) => ({
          type: encoded.type,
          data: encoded.data, // now unknown
          timestamp: new Date(),
          position,
        }))
      )
    ),

  read: (from) =>
    Stream.flatMap((storageEvent: Event) =>
      // Decode storage Event to domain event
      Schema.decode(schema)(storageEvent)
    ),
});
```

## Architectural Enforcement

### Dependency Cruiser Rules

The `.dependency-cruiser.js` file enforces layer separation:

**1. Protocol Internals Must Not Leak**

```javascript
{
  name: 'protocol-internals-must-not-leak',
  // Prevents direct imports of protocol.ts or server-protocol.ts
  // from outside the eventsourcing-protocol package
}
```

**2. Commands Layer Cannot Depend on Protocol**

```javascript
{
  name: 'eventsourcing-commands-layer-separation',
  // eventsourcing-commands (Wire API - Layer 2) must not depend on
  // eventsourcing-protocol (Protocol - Layer 3)
}
```

### ESLint Rules

The `eslint.config.mjs` file enforces import restrictions:

**1. No Protocol Internals Outside Protocol Package**

```javascript
{
  name: 'eventsourcing-layer-architecture',
  // Prevents imports from protocol.ts or server-protocol.ts internals
  // Forces use of package index exports
}
```

**2. Commands Cannot Import Protocol**

```javascript
{
  name: 'eventsourcing-commands-layer-separation',
  // Prevents eventsourcing-commands from importing eventsourcing-protocol
}
```

## Guidelines for New Code

### ✅ DO

- Create domain-specific event unions for each aggregate
- Create named event store tags per domain (`UserEventStore`, `OrderEventStore`)
- Use `WireCommand` from `@codeforbreakfast/eventsourcing-commands` for public APIs
- Keep `Protocol*` types internal to the protocol package
- Keep generic `Event` type at storage/network boundaries only

### ❌ DON'T

- Use `EventStore<Event>()` or `EventStore<unknown>()`
- Import `Protocol*` types outside the eventsourcing-protocol package
- Use direct imports from `eventsourcing-protocol/src/**` (use package index)
- Use `data: Schema.Unknown` in domain event schemas
- Return generic `Event[]` from command handlers

## Package Map

| Package                     | Layer     | Exports                               | Purpose                          |
| --------------------------- | --------- | ------------------------------------- | -------------------------------- |
| `eventsourcing-store`       | Domain    | `EventStore<TEvent>`, generic `Event` | Event storage contracts          |
| `eventsourcing-commands`    | Wire API  | `WireCommand`, `CommandResult`        | Public command API               |
| `eventsourcing-protocol`    | Protocol  | `Protocol`, `ProtocolLive`            | Internal protocol implementation |
| `eventsourcing-transport`   | Transport | `Transport` contracts                 | Transport abstraction            |
| `eventsourcing-transport-*` | Transport | Transport implementations             | WebSocket, in-memory, etc.       |
| `eventsourcing-aggregates`  | Domain    | `makeAggregateRoot`, `CommandHandler` | Aggregate patterns               |
| `eventsourcing-projections` | Domain    | Projection builders                   | Read-side projections            |

## Related Documentation

- **Aggregates**: See `packages/eventsourcing-aggregates/ARCHITECTURE.md` for aggregate-specific patterns
- **Protocol**: See `packages/eventsourcing-protocol/README.md` for protocol responsibilities
- **Commands**: See `packages/eventsourcing-commands/README.md` for command registry patterns
