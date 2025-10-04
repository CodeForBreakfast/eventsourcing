# Aggregate Architecture

## What Are Aggregates?

Aggregates are **write-side domain entities** that enforce business invariants through command processing. They:

1. **Maintain consistency boundaries** - All changes within an aggregate are consistent
2. **Enforce business rules** - Commands are validated against current state before producing events
3. **Produce domain events** - Successful commands result in typed events that describe what happened
4. **Are fully reconstitutable** - Rebuilt from their event stream on each command

## When to Use Aggregates

### ✅ Use Aggregates When:

- You need to **enforce business invariants** (e.g., "user email must be unique", "order can't be cancelled after shipping")
- Commands need to be **validated against current state** (e.g., "can't overdraw account")
- You have **complex domain logic** that benefits from encapsulation
- You want **strong typing and compile-time safety** for event production

### ❌ Use Raw Event Streams When:

- You're doing **read-side projections** only (use `@codeforbreakfast/eventsourcing-projections`)
- Commands are **simple transformations** without validation (e.g., logging, auditing)
- You need **maximum performance** and can bypass aggregate reconstitution
- You're implementing **process managers** that react to events without invariants

## Usage Patterns

### Pattern 1: REST API (Direct Aggregate Usage)

In REST APIs, HTTP is your protocol, so **bypass the command layer** and work directly with aggregates:

```typescript
app.post('/users/:id', async (req, res) => {
  const program = pipe(
    req.body,
    Schema.decodeUnknown(CreateUserPayload),
    Effect.flatMap((payload) =>
      pipe(
        UserAggregate.load(req.params.id),
        Effect.flatMap((aggregate) =>
          pipe(
            aggregate.commands.createUser(aggregate.data, payload),
            Effect.flatMap((events) =>
              UserAggregate.commit({
                id: req.params.id,
                eventNumber: aggregate.nextEventNumber,
                events: Chunk.fromIterable(events),
              })
            )
          )
        )
      )
    )
  );

  await Effect.runPromise(program);
  res.json({ success: true });
});
```

**Flow**: Validate HTTP body → Load aggregate → Execute command function → Commit events

### Pattern 2: Protocol-Based (WebSocket/Message Queue)

For protocol-based systems, use **WireCommand + CommandHandler** for uniform routing:

```typescript
// Define handler that wraps aggregate command
const createUserHandler: CommandHandler<UserEvent> = {
  execute: (wireCommand) =>
    pipe(
      wireCommand.payload,
      Schema.decodeUnknown(CreateUserPayload),
      Effect.flatMap((payload) =>
        pipe(
          UserAggregate.load(wireCommand.target),
          Effect.flatMap((aggregate) => aggregate.commands.createUser(aggregate.data, payload))
        )
      ),
      Effect.mapError(
        (error) => new CommandProcessingError({ commandId: wireCommand.id, cause: error })
      )
    ),
};

// Route commands to handlers
const userRouter: CommandRouter<UserEvent> = {
  route: (command) =>
    Match.value(command.name).pipe(
      Match.when('CreateUser', () => Effect.succeed(createUserHandler)),
      Match.exhaustive
    ),
};
```

**Flow**: WireCommand arrives → Router selects handler → Handler validates, loads aggregate, executes command → Returns events

**When to use each**:

- **REST API**: HTTP already provides routing/serialization - work directly with aggregates
- **WebSocket/MessageQueue**: Need generic command dispatch - use WireCommand/CommandHandler abstraction

## Core Aggregate APIs

### 1. CommandHandler

Defines how a command is executed against aggregate state:

```typescript
interface CommandHandler<TEvent> {
  readonly execute: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<readonly TEvent[], CommandProcessingError, never>;
}
```

**Key Points**:

- Generic over `TEvent` - each aggregate has its own event type
- Returns array of events (may produce multiple events from one command)
- Strongly typed - handlers can only return events from the aggregate's event union

**Example**:

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

### 2. CommandRouter

Routes commands to their appropriate handlers:

```typescript
interface CommandRouter<TEvent> {
  readonly route: (
    command: Readonly<WireCommand>
  ) => Effect.Effect<CommandHandler<TEvent>, CommandRoutingError, never>;
}
```

**Key Points**:

- Maps command names to handlers
- Type-safe - all handlers must return the same `TEvent` type
- Can use pattern matching for exhaustive command coverage

**Example**:

```typescript
const userRouter: CommandRouter<UserEvent> = {
  route: (command) =>
    Match.value(command.name).pipe(
      Match.when('CreateUser', () => Effect.succeed(createUserHandler)),
      Match.when('UpdateUser', () => Effect.succeed(updateUserHandler)),
      Match.exhaustive
    ),
};
```

### 3. makeAggregateRoot

Factory for creating aggregate roots with typed command handling:

```typescript
const makeAggregateRoot = <TId, TEvent, TState, TCommands, TTag>(
  idSchema: Schema.Schema<TId, string>,
  apply: (state: Option<TState>) => (event: TEvent) => Effect<TState, ParseError>,
  tag: Context.Tag<TTag, EventStore<TEvent>>,
  commands: TCommands
) => ({
  new: () => AggregateState<TState>,
  load: (id: string) => Effect<AggregateState<TState>>,
  commit: (options: CommitOptions) => Effect<void>,
  commands: TCommands,
});
```

**Parameters**:

- `idSchema` - Schema for aggregate ID validation
- `apply` - Event application function (how events change state)
- `tag` - Domain-specific EventStore tag
- `commands` - Command handlers for this aggregate

**Returns**:

- `new()` - Creates empty aggregate state
- `load(id)` - Loads aggregate from event stream
- `commit(options)` - Commits events to stream
- `commands` - The command handlers passed in

**Example**:

```typescript
// Define aggregate state
interface UserState {
  readonly name: string;
  readonly email: string;
}

// Define how events modify state
const applyUserEvent = (state: Option.Option<UserState>) => (event: UserEvent) =>
  Match.value(event).pipe(
    Match.when({ type: 'UserCreated' }, (e) =>
      Effect.succeed({ name: e.data.name, email: e.data.email })
    ),
    Match.when({ type: 'UserUpdated' }, (e) =>
      Effect.map(state, (s) => ({ ...s, name: e.data.name }))
    ),
    Match.exhaustive
  );

// Create aggregate root
const UserAggregate = makeAggregateRoot(UserId, applyUserEvent, UserEventStore, {
  createUser,
  updateUser,
});
```

### 4. createCommandProcessingService

Factory for creating command processing services that integrate aggregates with event storage:

```typescript
const createCommandProcessingService =
  <TEvent>(eventStoreTag: Context.Tag<EventStore<TEvent>, EventStore<TEvent>>) =>
  (router: CommandRouter<TEvent>) =>
    Effect<CommandProcessingService>;
```

**Usage Pattern**:

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

## Type Safety in Aggregates

Aggregates enforce type safety through **domain-specific event unions**:

### Pattern 1: Domain-Specific Event Types

**Always** define a union of events specific to your aggregate:

```typescript
// ✅ CORRECT - Domain-specific event union
const UserEvent = Schema.Union(UserCreated, UserUpdated, UserDeleted);
type UserEvent = typeof UserEvent.Type;
```

**Never** use generic `Event` type in aggregate logic:

```typescript
// ❌ WRONG - Generic event with unknown data
const handler: CommandHandler = {
  execute: () => Effect.succeed([{ type: 'UserCreated', data: { name: 'John' } } as Event]),
};
```

### Pattern 2: Domain-Specific EventStore Tags

Each aggregate creates its own EventStore tag with its event type:

```typescript
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
```

This ensures:

- Handlers can only produce events from `UserEvent` union
- TypeScript catches attempts to use wrong event types
- Full autocomplete for event data in handlers

### Pattern 3: Type-Safe Command Handlers

Command handlers are generic over event types:

```typescript
const createUser: CommandHandler<UserEvent> = {
  execute: (command) =>
    Effect.succeed([
      {
        type: 'UserCreated' as const, // Must be from UserEvent union
        data: {
          name: command.payload.name,
          email: command.payload.email,
        },
      },
    ]),
};
```

TypeScript ensures:

- Event type must be from `UserEvent` union
- Event data must match the schema for that event type
- Refactoring event schemas updates all handlers

## Aggregate Lifecycle

### 1. Command Arrives

```typescript
const wireCommand: WireCommand = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser',
  payload: { name: 'John', email: 'john@example.com' },
};
```

### 2. Load Aggregate State

```typescript
const aggregateState = await Effect.runPromise(UserAggregate.load('user-456'));
// Replays all events from stream to rebuild current state
```

### 3. Execute Command

```typescript
const handler = await Effect.runPromise(userRouter.route(wireCommand));

const events = await Effect.runPromise(handler.execute(wireCommand));
// Validates command against current state
// Returns new events if valid
```

### 4. Commit Events

```typescript
await Effect.runPromise(
  UserAggregate.commit({
    id: 'user-456',
    eventNumber: aggregateState.nextEventNumber,
    events: Chunk.fromIterable(events),
  })
);
// Persists events to stream
```

## Event Application Pattern

The `apply` function defines how events modify aggregate state:

```typescript
const applyUserEvent = (state: Option.Option<UserState>) => (event: UserEvent) =>
  Match.value(event).pipe(
    Match.when({ type: 'UserCreated' }, (e) =>
      // First event - create state
      Effect.succeed({ name: e.data.name, email: e.data.email })
    ),
    Match.when(
      { type: 'UserUpdated' },
      (e) =>
        // Subsequent events - modify existing state
        pipe(
          state,
          Option.map((s) => ({ ...s, name: e.data.name })),
          Option.getOrElse(() => ({ name: e.data.name, email: '' }))
        ),
      Effect.succeed
    ),
    Match.exhaustive // Ensures all event types are handled
  );
```

**Key Points**:

- `state` is `Option.Option<TState>` (None for new aggregates)
- Pattern match on event type for exhaustive handling
- Return `Effect<TState>` to allow validation/transformation
- Immutable updates - never mutate state

## Testing Aggregates

There are two levels of aggregate testing:

### 1. Testing the Full Registry (Integration)

Test the complete flow including command validation:

```typescript
import { describe, it, expect } from 'bun:test';
import { makeCommandRegistry } from '@codeforbreakfast/eventsourcing-commands';

describe('UserCommandRegistry', () => {
  it('handles CreateUser command', async () => {
    const registry = makeCommandRegistry(userCommands, userMatcher);

    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' },
    };

    const result = await Effect.runPromise(registry.dispatch(wireCommand));

    expect(result._tag).toBe('Success');
  });

  it('rejects invalid command payload', async () => {
    const registry = makeCommandRegistry(userCommands, userMatcher);

    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'not-an-email' }, // Invalid email
    };

    const result = await Effect.runPromise(registry.dispatch(wireCommand));

    expect(result._tag).toBe('Failure');
    expect(result.error._tag).toBe('ValidationError');
  });
});
```

### 2. Testing Handler Logic in Isolation (Unit)

Test just the business logic with type-safe domain commands:

```typescript
import { DomainCommand } from '@codeforbreakfast/eventsourcing-commands';

describe('CreateUserHandler', () => {
  it('produces UserCreated event', async () => {
    const command: DomainCommand<CreateUserPayload> = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' }, // Typed!
    };

    const events = await Effect.runPromise(createUserHandler.execute(command as WireCommand));

    expect(events).toEqual([
      {
        type: 'UserCreated',
        data: { name: 'John', email: 'john@example.com' },
      },
    ]);
  });

  it('rejects user creation when aggregate already exists', async () => {
    const existingState: Option.Option<UserState> = Option.some({
      name: 'Existing User',
      email: 'existing@example.com',
    });

    const command: DomainCommand<CreateUserPayload> = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' },
    };

    const result = await Effect.runPromise(
      Effect.either(createUserHandlerWithState(existingState, command as WireCommand))
    );

    expect(result._tag).toBe('Left');
  });
});
```

**Testing Guidelines**:

- **Use registry tests** for validation, routing, and end-to-end flow
- **Use handler tests** for business logic with typed domain commands
- **Don't manually create WireCommands** in application code - that's for infrastructure boundaries only

## Comparison: Aggregates vs Raw Streams

| Aspect             | Aggregates                     | Raw Event Streams              |
| ------------------ | ------------------------------ | ------------------------------ |
| **Type Safety**    | Full - events are union types  | Partial - events are `unknown` |
| **Business Logic** | Encapsulated in handlers       | Scattered in application code  |
| **Validation**     | Automatic via command handlers | Manual in application          |
| **Performance**    | Reconstitutes from events      | Direct stream access           |
| **Complexity**     | Higher - more structure        | Lower - more flexible          |
| **Use Case**       | Write-side with invariants     | Read-side projections          |

## Guidelines

### ✅ DO

- Create one aggregate per consistency boundary
- Use domain-specific event unions (`UserEvent`, `OrderEvent`)
- Keep aggregates small and focused
- Use `CommandHandler<YourEvent>` for type safety
- Test command logic in isolation

### ❌ DON'T

- Share event types across unrelated aggregates
- Use generic `Event` type in aggregate logic
- Create god aggregates with too many responsibilities
- Return generic `Event[]` from handlers
- Mix read and write concerns in aggregates

## Related Documentation

- **Architecture**: See `/docs/ARCHITECTURE.md` for the full 4-layer architecture and type safety principles
- **Commands**: See `@codeforbreakfast/eventsourcing-commands` for command registry patterns
- **Store**: See `@codeforbreakfast/eventsourcing-store` for event storage contracts
