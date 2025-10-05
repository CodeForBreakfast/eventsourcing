# @codeforbreakfast/eventsourcing-aggregates

Type-safe aggregate root patterns for event sourcing with Effect integration. This package provides functional patterns for building aggregate roots that handle commands, emit events, and maintain consistency in your event-sourced applications.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-aggregates effect
```

```bash
bun add @codeforbreakfast/eventsourcing-aggregates effect
```

## Key Features

- **Functional Aggregate Patterns**: Composable functions for building domain aggregates with Effect
- **Type-Safe Event Sourcing**: Schema-validated events with automatic state reconstruction
- **Domain-Specific Command Processing**: Generic command layer that maintains strong typing for each domain's events
- **Command Context Tracking**: Built-in command tracking with user attribution
- **Event Metadata**: Automatic timestamping and originator tracking for all events
- **Effect Integration**: Built on Effect for composable, functional aggregate operations
- **Testing Support**: Test-friendly APIs for unit testing aggregate behavior
- **Serialization Boundary Pattern**: Events stay strongly-typed throughout domain layer, generic only at storage/wire boundaries

## Core Exports

```typescript
import {
  // Main aggregate creation function
  makeAggregateRoot,

  // Core interfaces and types
  AggregateState,
  EventMetadata,

  // Command processing
  CommandHandler,
  CommandRouter,
  createCommandProcessingService,
  CommandProcessingService,
  CommandProcessingError,
  CommandRoutingError,

  // Command context services
  CommandContext,
  CommandContextService,

  // Helper functions
  eventMetadata,
  eventSchema,
} from '@codeforbreakfast/eventsourcing-aggregates';
```

## Quick Start

```typescript
import { Effect, Schema, Option, Chunk, Context, pipe } from 'effect';
import {
  makeAggregateRoot,
  AggregateState,
  CommandContext,
  CommandContextTest,
  eventSchema,
  eventMetadata,
} from '@codeforbreakfast/eventsourcing-aggregates';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { makeInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store-inmemory';

// 1. Define your aggregate ID schema
const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

// 2. Define your initiator ID schema (who executes commands)
const InitiatorId = Schema.String.pipe(Schema.brand('InitiatorId'));
type InitiatorId = typeof InitiatorId.Type;

// 3. Define your domain events using eventSchema
const UserRegisteredEvent = eventSchema(Schema.String, Schema.Literal('UserRegistered'), {
  email: Schema.String,
  name: Schema.String,
});

const UserEmailUpdatedEvent = eventSchema(Schema.String, Schema.Literal('UserEmailUpdated'), {
  oldEmail: Schema.String,
  newEmail: Schema.String,
});

const UserEvent = Schema.Union(UserRegisteredEvent, UserEmailUpdatedEvent);
type UserEvent = typeof UserEvent.Type;

// 4. Define your aggregate state
// Note: Aggregate state doesn't need to store its own ID - that's implicit from the stream
interface UserState {
  email: string;
  name: string;
  isActive: boolean;
}

// 5. Create the event application function
// Events don't contain aggregate IDs - the ID comes from the event stream
const applyUserEvent: (
  state: Option.Option<UserState>
) => (event: UserEvent) => Effect.Effect<UserState, Error, never> = (state) => (event) =>
  pipe(
    event.type === 'UserRegistered'
      ? Effect.succeed({
          email: event.data.email,
          name: event.data.name,
          isActive: true,
        })
      : event.type === 'UserEmailUpdated'
        ? pipe(
            state,
            Option.match({
              onNone: () => Effect.fail(new Error('Cannot update email: user does not exist')),
              onSome: (currentState) =>
                Effect.succeed({
                  ...currentState,
                  email: event.data.newEmail,
                }),
            })
          )
        : Effect.fail(new Error(`Unknown event type: ${(event as any).type}`))
  );

// 6. Create event store tag
class UserEventStore extends Context.Tag('UserEventStore')<
  UserEventStore,
  EventStore<UserEvent>
>() {}

// 7. Define command handlers that return functions taking state
// Note: Commands don't need userId for existing aggregates - it's implicit from the stream
const registerUser = (email: string, name: string) => (currentState: AggregateState<UserState>) =>
  pipe(
    currentState.data,
    Option.match({
      onSome: () => Effect.fail(new Error('User already exists')),
      onNone: () =>
        pipe(
          eventMetadata<string>(),
          Effect.map((metadata) =>
            Chunk.of({
              type: 'UserRegistered' as const,
              metadata,
              data: { email, name },
            } satisfies UserEvent)
          )
        ),
    })
  );

const updateUserEmail = (newEmail: string) => (currentState: AggregateState<UserState>) =>
  pipe(
    currentState.data,
    Option.match({
      onNone: () => Effect.fail(new Error('User not found')),
      onSome: (state) =>
        pipe(
          eventMetadata<string>(),
          Effect.map((metadata) =>
            Chunk.of({
              type: 'UserEmailUpdated' as const,
              metadata,
              data: {
                oldEmail: state.email,
                newEmail,
              },
            } satisfies UserEvent)
          )
        ),
    })
  );

// 8. Create the aggregate root
const UserAggregate = makeAggregateRoot(
  UserId,
  Schema.String,
  applyUserEvent as any,
  UserEventStore,
  {
    registerUser,
    updateUserEmail,
  }
);

// 9. Usage example
const userId = 'user-123' as UserId; // The aggregate ID is only used for loading/committing

const program = pipe(
  // Load an existing user (returns empty state if not found)
  UserAggregate.load(userId),
  Effect.tap((state) => Effect.log(`Loaded user state: ${JSON.stringify(state)}`)),
  Effect.flatMap((existingUser) => {
    // Create a new user if one doesn't exist
    if (Option.isNone(existingUser.data)) {
      return pipe(
        // Generate registration events using the command handler
        UserAggregate.commands.registerUser('john@example.com', 'John Doe')(existingUser as any),
        Effect.flatMap((events: any) =>
          // Commit events to store with the aggregate ID
          UserAggregate.commit({
            id: userId,
            eventNumber: existingUser.nextEventNumber,
            events,
          })
        ),
        Effect.flatMap(() => UserAggregate.load(userId)),
        Effect.tap((state) => Effect.log(`User after registration: ${JSON.stringify(state)}`))
      );
    }
    return Effect.succeed(existingUser);
  }),
  Effect.flatMap((userState) =>
    // Update the user's email
    pipe(
      UserAggregate.commands.updateUserEmail('john.doe@newdomain.com')(userState as any),
      Effect.flatMap((events: any) =>
        UserAggregate.commit({
          id: userId,
          eventNumber: userState.nextEventNumber,
          events,
        })
      ),
      Effect.flatMap(() => UserAggregate.load(userId)),
      Effect.tap((state) => Effect.log(`User after email update: ${JSON.stringify(state)}`))
    )
  )
);

// Run with dependencies
(async () => {
  const eventStoreLayer: any = makeInMemoryEventStore(UserEventStore as any);
  const contextLayer: any = CommandContextTest<string>('system-user');

  const runnable: Effect.Effect<any, any, never> = pipe(
    program,
    Effect.provide(eventStoreLayer),
    Effect.provide(contextLayer)
  ) as any;

  await Effect.runPromise(runnable);
})();
```

## Core Concepts

### AggregateState

Represents the current state of an aggregate at a point in time:

```typescript
import { Option } from 'effect';

interface AggregateState<TData> {
  readonly nextEventNumber: number;
  readonly data: Option.Option<TData>;
}
```

### makeAggregateRoot

The main function for creating aggregate roots with event sourcing capabilities:

```typescript
import { Schema } from 'effect';
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

declare const IdSchema: any;
declare const applyEventFunction: any;
declare const EventStoreTag: any;
declare const commandHandlers: any;

const MyAggregate = makeAggregateRoot(
  IdSchema,
  Schema.String,
  applyEventFunction,
  EventStoreTag,
  commandHandlers
);
```

### Event Schema Creation

Use `eventSchema` to create properly structured domain events:

```typescript
import { Schema } from 'effect';
import { eventSchema } from '@codeforbreakfast/eventsourcing-aggregates';

const MyEvent = eventSchema(Schema.String, Schema.Literal('MyEventType'), {
  field1: Schema.String,
  field2: Schema.Number,
});
```

### Command Context

Track command execution metadata:

```typescript
import { Effect, pipe } from 'effect';
import { CommandContext, CommandContextTest } from '@codeforbreakfast/eventsourcing-aggregates';

const myCommand = pipe(
  CommandContext<string>(),
  Effect.flatMap((context) => context.getInitiator),
  Effect.map((initiatorId) => initiatorId)
);

const testLayer = CommandContextTest<string>('test-user-id');
```

### Event Metadata Generation

Automatically generate event metadata with timestamps and originator:

```typescript
import { Effect, pipe } from 'effect';
import { eventMetadata } from '@codeforbreakfast/eventsourcing-aggregates';

const createEvent = pipe(
  eventMetadata<string>(),
  Effect.map((metadata) => ({
    type: 'SomethingHappened' as const,
    metadata,
    data: {},
  }))
);
```

## Advanced Patterns

### Business Rule Validation

```typescript
import { Effect, Option, Chunk, pipe } from 'effect';
import { AggregateState, eventMetadata } from '@codeforbreakfast/eventsourcing-aggregates';

interface BankAccountState {
  balance: number;
}

const transferMoney =
  (toAccountId: string, amount: number) => (currentState: AggregateState<BankAccountState>) =>
    pipe(
      currentState.data,
      Option.match({
        onNone: () => Effect.fail(new Error('Account not found')),
        onSome: (account) => {
          if (account.balance < amount) {
            return Effect.fail(new Error('Insufficient funds'));
          }
          if (amount <= 0) {
            return Effect.fail(new Error('Transfer amount must be positive'));
          }

          return pipe(
            eventMetadata<string>(),
            Effect.map((metadata) =>
              Chunk.of({
                type: 'MoneyTransferred' as const,
                metadata,
                data: {
                  toAccountId,
                  amount,
                },
              })
            )
          );
        },
      })
    );
```

### Complex Event Application

```typescript
import { Effect, Option, pipe } from 'effect';

declare const BankAccountEvent: any;
type BankAccountEvent = typeof BankAccountEvent;

interface BankAccountState {
  balance: number;
  isActive: boolean;
  transactions: Array<{
    type: string;
    amount: number;
    timestamp: Date;
  }>;
}

const applyBankAccountEvent =
  (state: Option.Option<BankAccountState>) => (event: BankAccountEvent) => {
    switch (event.type) {
      case 'AccountOpened':
        return pipe(
          state,
          Option.match({
            onSome: () => Effect.fail(new Error('Account already exists')),
            onNone: () =>
              Effect.succeed({
                balance: event.data.initialDeposit,
                isActive: true,
                transactions: [],
              }),
          })
        );

      case 'MoneyTransferred':
        return pipe(
          state,
          Option.match({
            onNone: () => Effect.fail(new Error('Account does not exist')),
            onSome: (currentState) =>
              Effect.succeed({
                ...currentState,
                balance: currentState.balance - event.data.amount,
                transactions: [
                  ...currentState.transactions,
                  {
                    type: 'transfer' as const,
                    amount: event.data.amount,
                    timestamp: event.metadata.occurredAt,
                  },
                ],
              }),
          })
        );

      default:
        return Effect.fail(new Error(`Unknown event: ${(event as any).type}`));
    }
  };
```

### Testing Aggregates

Test aggregate behavior in isolation:

```typescript
import { describe, it, expect } from 'bun:test';
import { Effect, Option, Chunk, pipe } from 'effect';
import { AggregateState, CommandContextTest } from '@codeforbreakfast/eventsourcing-aggregates';

declare const UserAggregate: any;
declare const applyUserEvent: any;

interface UserState {
  email: string;
  name: string;
  isActive: boolean;
}

describe('UserAggregate', () => {
  it('should register a new user', async () => {
    const program: Effect.Effect<any, any, never> = pipe(
      Effect.succeed(UserAggregate.new()),
      Effect.flatMap((state: any) =>
        pipe(
          UserAggregate.commands.registerUser('test@example.com', 'Test User')(state),
          Effect.tap((events: any) => {
            const event: any = Chunk.unsafeHead(events);
            expect(event.type).toBe('UserRegistered');
            expect(event.data.email).toBe('test@example.com');
            return Effect.void;
          }),
          Effect.flatMap((events: any) =>
            pipe(
              Chunk.unsafeHead(events),
              applyUserEvent(state.data),
              Effect.tap((newState: any) => {
                expect(newState.email).toBe('test@example.com');
                expect(newState.isActive).toBe(true);
                return Effect.void;
              })
            )
          )
        )
      )
    ) as any;

    await Effect.runPromise(
      pipe(program, Effect.provide(CommandContextTest<string>('test-initiator')))
    );
  });

  it('should prevent duplicate registration', async () => {
    const existingState: AggregateState<UserState> = {
      nextEventNumber: 1,
      data: Option.some({
        email: 'existing@example.com',
        name: 'Existing User',
        isActive: true,
      }),
    };

    const program: Effect.Effect<any, any, never> = pipe(
      UserAggregate.commands.registerUser('duplicate@example.com', 'Duplicate User')(existingState),
      Effect.either,
      Effect.tap((result: any) => {
        expect(result._tag).toBe('Left');
        return Effect.void;
      })
    ) as any;

    await Effect.runPromise(
      pipe(program, Effect.provide(CommandContextTest<string>('test-initiator')))
    );
  });
});
```

## Error Handling

Handle domain-specific errors with Effect's error management:

```typescript
import { Data, Effect, pipe } from 'effect';

declare const TransferCommand: any;
type TransferCommand = typeof TransferCommand;
declare const processTransfer: (command: TransferCommand) => Effect.Effect<any, any, any>;

class InsufficientFundsError extends Data.TaggedError('InsufficientFundsError')<{
  required: number;
  available: number;
}> {}

class AccountNotFoundError extends Data.TaggedError('AccountNotFoundError')<{
  accountId: string;
}> {}

const handleTransferCommand = (command: TransferCommand) =>
  pipe(
    processTransfer(command),
    Effect.catchTag('InsufficientFundsError', (error) =>
      Effect.logError(`Insufficient funds: need ${error.required}, have ${error.available}`)
    ),
    Effect.catchTag('AccountNotFoundError', (error) =>
      Effect.logError(`Account not found: ${error.accountId}`)
    )
  );
```

## Command Processing

The package provides a generic command processing layer that maintains strong typing for domain events.

### Type-Safe Command Handlers

Command handlers are generic over your domain event types:

```typescript
import { Effect, Schema, Context, Layer, pipe } from 'effect';
import {
  CommandHandler,
  CommandRouter,
  createCommandProcessingService,
  CommandProcessingService,
  CommandRoutingError,
} from '@codeforbreakfast/eventsourcing-aggregates';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const userEventStoreLayer: any;

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

const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);

const createUserHandler: CommandHandler<UserEvent> = {
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

const createUserRouter = (): CommandRouter<UserEvent> => ({
  route: (command: Readonly<WireCommand>) => {
    if (command.target === 'user' && command.name === 'CreateUser') {
      return Effect.succeed(createUserHandler);
    }
    return Effect.fail(
      new CommandRoutingError({
        target: command.target,
        message: `No handler found for ${command.target}:${command.name}`,
      })
    );
  },
});

const UserCommandProcessingService = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(UserEventStore)(createUserRouter())
);

const processCommand = (command: WireCommand) =>
  pipe(
    CommandProcessingService,
    Effect.flatMap((service) => service.processCommand(command)),
    Effect.provide(UserCommandProcessingService),
    Effect.provide(userEventStoreLayer)
  );
```

### Key Principles

**⚠️ IMPORTANT: Never use generic `Event` types in domain code**

The `Event` type from `@codeforbreakfast/eventsourcing-store` has `data: Schema.Unknown` and is only for serialization boundaries (storage, wire protocol).

```typescript
import { Effect } from 'effect';
import { CommandHandler } from '@codeforbreakfast/eventsourcing-aggregates';
import type { Event } from '@codeforbreakfast/eventsourcing-store';

declare const UserEvent: any;
type UserEvent = typeof UserEvent;

const wrongHandler: CommandHandler<Event> = {
  execute: () => Effect.succeed([{ type: 'UserCreated', data: { name: 'John' } } as Event]),
};

const correctHandler: CommandHandler<UserEvent> = {
  execute: () =>
    Effect.succeed([{ type: 'UserCreated', data: { name: 'John', email: 'john@example.com' } }]),
};
```

Each aggregate or bounded context should:

1. Define its own event union type
2. Create a named event store tag
3. Use typed command handlers and routers

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design rationale.

## Integration with Event Stores

This package works with any event store implementation that matches the EventStore interface:

```typescript
import { Effect, pipe } from 'effect';
import { makeInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store-inmemory';

declare const myAggregateOperation: Effect.Effect<any, any, any>;
declare const MyEventStoreTag: any;
declare const postgresEventStore: any;

const eventStoreLayer: any = makeInMemoryEventStore(MyEventStoreTag as any);
const testProgram = pipe(myAggregateOperation, Effect.provide(eventStoreLayer));

const productionProgram = pipe(myAggregateOperation, Effect.provide(postgresEventStore));
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-commands](../eventsourcing-commands)** - CQRS command types and schemas
- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Core event store interfaces and in-memory implementation
- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL event store implementation
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed TypeScript definitions, see the [source code](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
