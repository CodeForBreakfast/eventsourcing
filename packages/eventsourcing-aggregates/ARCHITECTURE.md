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
import { Effect, Schema, Chunk, pipe } from 'effect';

declare const CreateUserPayload: Schema.Schema<any, any>;
declare const UserAggregate: any;
declare const app: any;

app.post('/users/:id', async (req: any, res: any) => {
  const program: Effect.Effect<any, any, never> = pipe(
    req.body,
    Schema.decodeUnknown(CreateUserPayload),
    Effect.flatMap((payload) =>
      pipe(
        UserAggregate.load(req.params.id),
        Effect.flatMap((aggregate: any) =>
          pipe(
            aggregate.commands.createUser(aggregate.data, payload),
            Effect.flatMap((events: any) =>
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
  ) as any;

  await Effect.runPromise(program);
  res.json({ success: true });
});
```

**Flow**: Validate HTTP body → Load aggregate → Execute command function → Commit events

### Pattern 2: Protocol-Based (WebSocket/Message Queue)

For protocol-based systems, use **WireCommand + CommandHandler** for uniform routing:

```typescript
import { Effect, Schema, Match, pipe } from 'effect';
import {
  CommandHandler,
  CommandRouter,
  CommandProcessingError,
} from '@codeforbreakfast/eventsourcing-aggregates';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const CreateUserPayload: Schema.Schema<any, any>;
declare const UserAggregate: any;
declare const UserEvent: Schema.Schema<any, any>;
type UserEvent = typeof UserEvent.Type;

const createUserHandler: CommandHandler<UserEvent> = {
  execute: (
    wireCommand: Readonly<WireCommand>
  ): Effect.Effect<readonly UserEvent[], CommandProcessingError, never> =>
    pipe(
      wireCommand.payload,
      Schema.decodeUnknown(CreateUserPayload),
      Effect.flatMap((payload) =>
        pipe(
          UserAggregate.load(wireCommand.target),
          Effect.flatMap((aggregate: any) => aggregate.commands.createUser(aggregate.data, payload))
        )
      ),
      Effect.mapError(
        (error) =>
          new CommandProcessingError({
            message: `Error processing command: ${error}`,
            cause: error,
          })
      )
    ) as any,
};

const userRouter: CommandRouter<UserEvent> = {
  route: (command: Readonly<WireCommand>) =>
    Match.value(command.name).pipe(
      Match.when('CreateUser', () => Effect.succeed(createUserHandler)),
      Match.orElse(() => Effect.succeed(createUserHandler))
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
import { Effect } from 'effect';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError } from '@codeforbreakfast/eventsourcing-aggregates';

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
import { Effect } from 'effect';
import { CommandHandler } from '@codeforbreakfast/eventsourcing-aggregates';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;

const createUser: CommandHandler<UserEvent> = {
  execute: (command: Readonly<WireCommand>) =>
    Effect.succeed([
      {
        type: 'UserCreated' as const,
        data: {
          name: (command.payload as any).name,
          email: (command.payload as any).email,
        },
      },
    ]),
};
```

### 2. CommandRouter

Routes commands to their appropriate handlers:

```typescript
import { Effect } from 'effect';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
import { CommandHandler, CommandRoutingError } from '@codeforbreakfast/eventsourcing-aggregates';

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
import { Effect, Match } from 'effect';
import { CommandRouter } from '@codeforbreakfast/eventsourcing-aggregates';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;
declare const createUserHandler: any;
declare const updateUserHandler: any;

const userRouter: CommandRouter<UserEvent> = {
  route: (command: Readonly<WireCommand>) =>
    Match.value(command.name).pipe(
      Match.when('CreateUser', () => Effect.succeed(createUserHandler)),
      Match.when('UpdateUser', () => Effect.succeed(updateUserHandler)),
      Match.orElse(() => Effect.succeed(createUserHandler))
    ),
};
```

### 3. makeAggregateRoot

Factory for creating aggregate roots with typed command handling:

```typescript
import { Schema, Option, Effect, Context } from 'effect';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { AggregateState, makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

declare const TId: any;
declare const TEvent: any;
declare const TState: any;
declare const TCommands: any;
declare const TTag: any;
declare const ParseError: any;
declare const CommitOptions: any;

const aggregateFactory = <TId, TEvent, TState, TCommands, TTag>(
  idSchema: Schema.Schema<TId, string>,
  apply: (state: Option.Option<TState>) => (event: TEvent) => Effect.Effect<TState, any, never>,
  tag: Context.Tag<TTag, EventStore<TEvent>>,
  commands: TCommands
): any => ({
  new: (): AggregateState<TState> => ({}) as any,
  load: (_id: string): Effect.Effect<AggregateState<TState>, never, never> => ({}) as any,
  commit: (_options: any): Effect.Effect<void, never, never> => ({}) as any,
  commands: commands,
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
import { Effect, Option, Match, Schema, pipe } from 'effect';
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;
declare const UserId: any;
declare const UserEventStore: any;
declare const createUser: any;
declare const updateUser: any;

interface UserState {
  readonly name: string;
  readonly email: string;
}

const applyUserEvent =
  (state: Option.Option<UserState>) =>
  (event: UserEvent): Effect.Effect<UserState, never, never> =>
    Match.value(event).pipe(
      Match.when({ type: 'UserCreated' }, (e: any) =>
        Effect.succeed({ name: e.data.name, email: e.data.email })
      ),
      Match.when({ type: 'UserUpdated' }, (e: any) =>
        pipe(
          Option.getOrElse(
            Option.map(state, (s) => ({ ...s, name: e.data.name })),
            () => ({
              name: e.data.name,
              email: '',
            })
          ),
          Effect.succeed
        )
      ),
      Match.orElse(() => Effect.succeed({ name: '', email: '' }))
    );

const UserAggregate = makeAggregateRoot(UserId, Schema.String, applyUserEvent, UserEventStore, {
  createUser,
  updateUser,
});
```

### 4. createCommandProcessingService

Factory for creating command processing services that integrate aggregates with event storage:

```typescript
import { Effect, Context } from 'effect';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import {
  CommandRouter,
  CommandProcessingService,
} from '@codeforbreakfast/eventsourcing-aggregates';

declare const createCommandProcessingService: <TEvent>(
  eventStoreTag: Context.Tag<any, EventStore<TEvent>>
) => (router: CommandRouter<TEvent>) => Effect.Effect<CommandProcessingService, never, never>;
```

**Usage Pattern**:

```typescript
import { Schema, Context, Layer, Effect } from 'effect';
import {
  CommandRouter,
  createCommandProcessingService,
  CommandProcessingService,
} from '@codeforbreakfast/eventsourcing-aggregates';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const OrderCreated: Schema.Schema<any, any>;
declare const OrderShipped: Schema.Schema<any, any>;
declare const OrderCancelled: Schema.Schema<any, any>;

const OrderEvent = Schema.Union(OrderCreated, OrderShipped, OrderCancelled);
type OrderEvent = typeof OrderEvent.Type;

const OrderEventStore = Context.GenericTag<EventStore<OrderEvent>, EventStore<OrderEvent>>(
  'OrderEventStore'
);

const createOrderRouter = (): CommandRouter<OrderEvent> => ({
  route: (_command: Readonly<WireCommand>): Effect.Effect<any, never, never> => {
    throw new Error('Not implemented');
  },
});

const OrderCommandProcessingService: any = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(OrderEventStore)(createOrderRouter())
);
```

## Type Safety in Aggregates

Aggregates enforce type safety through **domain-specific event unions**:

### Pattern 1: Domain-Specific Event Types

**Always** define a union of events specific to your aggregate:

```typescript
import { Schema } from 'effect';

declare const UserCreated: Schema.Schema<any, any>;
declare const UserUpdated: Schema.Schema<any, any>;
declare const UserDeleted: Schema.Schema<any, any>;

const UserEvent = Schema.Union(UserCreated, UserUpdated, UserDeleted);
type UserEvent = typeof UserEvent.Type;
```

**Never** use generic `Event` type in aggregate logic:

```typescript
import { Effect } from 'effect';
import { CommandHandler } from '@codeforbreakfast/eventsourcing-aggregates';
import type { Event } from '@codeforbreakfast/eventsourcing-store';

const handler: CommandHandler<Event> = {
  execute: () => Effect.succeed([{ type: 'UserCreated', data: { name: 'John' } } as Event]),
};
```

### Pattern 2: Domain-Specific EventStore Tags

Each aggregate creates its own EventStore tag with its event type:

```typescript
import { Context } from 'effect';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;

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
import { Effect } from 'effect';
import { CommandHandler } from '@codeforbreakfast/eventsourcing-aggregates';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;

const createUser: CommandHandler<UserEvent> = {
  execute: (command: Readonly<WireCommand>) =>
    Effect.succeed([
      {
        type: 'UserCreated' as const,
        data: {
          name: (command.payload as any).name,
          email: (command.payload as any).email,
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
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

const wireCommand: WireCommand = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser',
  payload: { name: 'John', email: 'john@example.com' },
};
```

### 2. Load Aggregate State

```typescript
import { Effect } from 'effect';

declare const UserAggregate: any;

const aggregateState = await Effect.runPromise(UserAggregate.load('user-456'));
```

### 3. Execute Command

```typescript
import { Effect } from 'effect';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const userRouter: any;
declare const wireCommand: WireCommand;

const handler: any = await Effect.runPromise(userRouter.route(wireCommand));

const events: any = await Effect.runPromise(handler.execute(wireCommand));
```

### 4. Commit Events

```typescript
import { Effect, Chunk } from 'effect';

declare const UserAggregate: any;
declare const aggregateState: any;
declare const events: any;

await Effect.runPromise(
  UserAggregate.commit({
    id: 'user-456',
    eventNumber: aggregateState.nextEventNumber,
    events: Chunk.fromIterable(events),
  })
);
```

## Event Application Pattern

The `apply` function defines how events modify aggregate state:

```typescript
import { Effect, Option, Match, pipe } from 'effect';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;

interface UserState {
  readonly name: string;
  readonly email: string;
}

const applyUserEvent =
  (state: Option.Option<UserState>) =>
  (event: UserEvent): Effect.Effect<UserState, never, never> =>
    Match.value(event).pipe(
      Match.when({ type: 'UserCreated' }, (e: any) =>
        Effect.succeed({ name: e.data.name, email: e.data.email })
      ),
      Match.when({ type: 'UserUpdated' }, (e: any) =>
        pipe(
          state,
          Option.map((s) => ({ ...s, name: e.data.name })),
          Option.getOrElse(() => ({ name: e.data.name, email: '' })),
          Effect.succeed
        )
      ),
      Match.orElse(() => Effect.succeed({ name: '', email: '' }))
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
import { Effect } from 'effect';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const makeCommandRegistry: any;
declare const userCommands: any;
declare const userMatcher: any;

describe('UserCommandRegistry', () => {
  it('handles CreateUser command', async () => {
    const registry = makeCommandRegistry(userCommands, userMatcher);

    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' },
    };

    const result: any = await Effect.runPromise(registry.dispatch(wireCommand));

    expect(result._tag).toBe('Success');
  });

  it('rejects invalid command payload', async () => {
    const registry = makeCommandRegistry(userCommands, userMatcher);

    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'not-an-email' },
    };

    const result: any = await Effect.runPromise(registry.dispatch(wireCommand));

    expect(result._tag).toBe('Failure');
    expect(result.error._tag).toBe('ValidationError');
  });
});
```

### 2. Testing Handler Logic in Isolation (Unit)

Test just the business logic with type-safe domain commands:

```typescript
import { describe, it, expect } from 'bun:test';
import { Effect, Option } from 'effect';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const CreateUserPayload: any;
type CreateUserPayload = typeof CreateUserPayload;

declare const createUserHandler: any;
declare const createUserHandlerWithState: any;

interface UserState {
  readonly name: string;
  readonly email: string;
}

describe('CreateUserHandler', () => {
  it('produces UserCreated event', async () => {
    const command: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' },
    };

    const events = await Effect.runPromise(createUserHandler.execute(command));

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

    const command: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: { name: 'John', email: 'john@example.com' },
    };

    const result = await Effect.runPromise(
      Effect.either(createUserHandlerWithState(existingState, command))
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
