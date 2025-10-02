# Architecture: Command Processing and Type Safety

## Design Philosophy

This package enforces strong typing throughout the domain layer, with generic `Event` types only at serialization boundaries (storage, wire protocol). Domain events are always specific union types, never generic or `unknown`.

## Type Safety Principles

### 1. Domain Events Are Always Specific

**Never use `Event` or `unknown` types in domain logic.**

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

### 2. The `Event` Type is for Serialization Boundaries Only

The `Event` type exists in `@codeforbreakfast/eventsourcing-store` with `data: Schema.Unknown`:

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
// In user/events.ts
const UserCreated = Schema.Struct({
  type: Schema.Literal('UserCreated'),
  data: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
});

const UserUpdated = Schema.Struct({
  type: Schema.Literal('UserUpdated'),
  data: Schema.Struct({
    name: Schema.String,
  }),
});

const UserEvent = Schema.Union(UserCreated, UserUpdated);
type UserEvent = typeof UserEvent.Type;

// In user/services.ts
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
```

### 4. Command Handlers Are Generic Over Event Types

The command processing layer is fully generic to support any domain's event types:

```typescript
export interface CommandHandler<TEvent> {
  readonly execute: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<readonly TEvent[], CommandProcessingError, never>;
}

export interface CommandRouter<TEvent> {
  readonly route: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<CommandHandler<TEvent>, CommandRoutingError, never>;
}
```

This allows each domain to have strongly-typed command handlers:

```typescript
const createUser: CommandHandler<UserEvent> = {
  execute: (command) =>
    Effect.succeed([
      {
        type: 'UserCreated' as const,
        data: {
          name: command.payload.name,
          email: command.payload.email,
        },
      },
    ]),
};
```

## Command Processing Factory

The `createCommandProcessingService` factory is generic and requires both:

1. A domain-specific event store tag
2. A domain-specific command router

```typescript
export const createCommandProcessingService = <TEvent>(
  eventStoreTag: Readonly<Context.Tag<EventStore<TEvent>, EventStore<TEvent>>>
) => (router: ReadonlyDeep<CommandRouter<TEvent>>) => // ...
```

**Usage pattern:**

```typescript
// Define domain events
const OrderEvent = Schema.Union(OrderCreated, OrderShipped, OrderCancelled);

// Create domain-specific event store tag
const OrderEventStore = Context.GenericTag<EventStore<OrderEvent>, EventStore<OrderEvent>>(
  'OrderEventStore'
);

// Create router with domain-specific handlers
const createOrderRouter = (): CommandRouter<OrderEvent> => ({
  route: (command) => {
    // Return handlers that produce OrderEvent[]
  },
});

// Wire it all together
const OrderCommandProcessingService = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(OrderEventStore)(createOrderRouter())
);
```

## Why This Pattern?

### Type Safety Guarantees

1. **Compile-time verification**: TypeScript ensures handlers can only produce events from the domain union
2. **No accidental `unknown`**: Impossible to accidentally use generic events in domain logic
3. **Refactoring safety**: Changing event schemas causes compile errors in all handlers
4. **IDE autocomplete**: Full type information for event data in handlers and aggregates

### Separation of Concerns

1. **Domain layer**: Works with typed domain events (`UserEvent`, `OrderEvent`)
2. **Infrastructure layer**: Handles serialization with generic `Event` type
3. **Clear boundaries**: The transition point between typed/untyped is explicit (event store implementation)

### Storage Independence

The event store implementation (Postgres, in-memory, etc.) uses the generic `Event` type for storage but transforms to/from domain events at the boundary:

```typescript
// In postgres event store implementation
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

## Comparison to Original Design

### What Changed

**Before (over-engineered):**

- Factory functions (`EventStore<TEvent>()`) that invited default type parameters
- Generic `Event` type used throughout domain layer
- Command handlers returned `Event[]` with `data: unknown`
- Lost type safety at command boundary

**After (domain-specific types):**

- Direct tag creation per domain: `Context.GenericTag<EventStore<UserEvent>, ...>`
- Domain-specific event unions (`UserEvent`, `OrderEvent`)
- Generic command processing layer that works with any event type
- Full type safety from command to storage

### What Stayed the Same

- `Event` type still exists for wire/storage boundaries
- Event stores still use the same `EventStore<TEvent>` interface
- Command processing architecture unchanged
- Effect-based composition patterns

## Guidelines for New Code

### ✅ DO

- Create domain-specific event unions for each aggregate
- Create named event store tags per domain (`UserEventStore`, `OrderEventStore`)
- Use `CommandHandler<YourEvent>` and `CommandRouter<YourEvent>`
- Keep `Event` type at storage/network boundaries only

### ❌ DON'T

- Use `EventStore<Event>()` or `EventStore<unknown>()`
- Use default type parameters on event store factories
- Return generic `Event[]` from command handlers
- Use `data: Schema.Unknown` in domain event schemas

## Testing Strategy

Tests should use domain-specific events:

```typescript
// Define test domain events
const TestEvent = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('TestCreated'),
    data: Schema.Struct({ id: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal('TestUpdated'),
    data: Schema.Struct({ value: Schema.Number }),
  })
);

// Create test event store
const TestEventStore = Context.GenericTag<
  EventStore<typeof TestEvent.Type>,
  EventStore<typeof TestEvent.Type>
>('TestEventStore');

// Create handlers and routers with TestEvent
const testHandler: CommandHandler<typeof TestEvent.Type> = {
  execute: () => Effect.succeed([{ type: 'TestCreated', data: { id: 'test-123' } }]),
};
```

## Migration Path

To migrate existing code to this pattern:

1. **Define domain event union**: Create `Schema.Union` of all events for your aggregate
2. **Create domain-specific tag**: Replace factory calls with direct `Context.GenericTag` creation
3. **Update command handlers**: Add `<YourEvent>` type parameter to handlers and routers
4. **Update factory usage**: Pass event store tag to `createCommandProcessingService`
5. **Remove `Event` imports**: Delete any imports of generic `Event` from domain code

## Related Patterns

This architecture supports and enables:

- **Aggregate Root Pattern**: Each aggregate has its own event union and event store tag
- **Bounded Contexts**: Different domains have different event types with no mixing
- **CQRS**: Read models can subscribe to specific event types with full type information
- **Event Upcasting**: Type-safe transformation from old event schemas to new ones
