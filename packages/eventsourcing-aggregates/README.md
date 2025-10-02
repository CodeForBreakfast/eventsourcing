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
  EventOriginatorId,

  // Command processing
  CommandHandler,
  CommandRouter,
  createCommandProcessingService,
  CommandProcessingService,
  CommandProcessingError,
  CommandRoutingError,

  // Command context services
  CommandContext,
  CommandInitiatorId,

  // Current user services
  CurrentUser,
  CurrentUserError,

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
import { EventStore, makeInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

// 1. Define your aggregate ID schema
const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

// 2. Define your domain events using eventSchema
const UserRegisteredEvent = eventSchema(Schema.Literal('UserRegistered'), {
  email: Schema.String,
  name: Schema.String,
});

const UserEmailUpdatedEvent = eventSchema(Schema.Literal('UserEmailUpdated'), {
  oldEmail: Schema.String,
  newEmail: Schema.String,
});

const UserEvent = Schema.Union(UserRegisteredEvent, UserEmailUpdatedEvent);
type UserEvent = typeof UserEvent.Type;

// 3. Define your aggregate state
// Note: Aggregate state doesn't need to store its own ID - that's implicit from the stream
interface UserState {
  email: string;
  name: string;
  isActive: boolean;
}

// 4. Create the event application function
// Events don't contain aggregate IDs - the ID comes from the event stream
const applyUserEvent = (state: Option.Option<UserState>) => (event: UserEvent) => {
  switch (event.type) {
    case 'UserRegistered':
      return Effect.succeed({
        email: event.data.email,
        name: event.data.name,
        isActive: true,
      });

    case 'UserEmailUpdated':
      return pipe(
        state,
        Option.match({
          onNone: () => Effect.fail(new Error('Cannot update email: user does not exist')),
          onSome: (currentState) =>
            Effect.succeed({
              ...currentState,
              email: event.data.newEmail,
            }),
        })
      );

    default:
      return Effect.fail(new Error(`Unknown event type: ${(event as any).type}`));
  }
};

// 5. Create event store tag
class UserEventStore extends Context.Tag('UserEventStore')<
  UserEventStore,
  EventStore<UserEvent>
>() {}

// 6. Define command handlers that return functions taking state
// Note: Commands don't need userId for existing aggregates - it's implicit from the stream
const registerUser = (email: string, name: string) => (currentState: AggregateState<UserState>) =>
  pipe(
    currentState.data,
    Option.match({
      onSome: () => Effect.fail(new Error('User already exists')),
      onNone: () =>
        pipe(
          eventMetadata(),
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
          eventMetadata(),
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

// 7. Create the aggregate root
const UserAggregate = makeAggregateRoot(UserId, applyUserEvent, UserEventStore, {
  registerUser,
  updateUserEmail,
});

// 8. Usage example
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
        UserAggregate.commands.registerUser('john@example.com', 'John Doe')(existingUser),
        Effect.flatMap((events) =>
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
      UserAggregate.commands.updateUserEmail('john.doe@newdomain.com')(userState),
      Effect.flatMap((events) =>
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
const runnable = pipe(
  program,
  Effect.provide(makeInMemoryEventStore(UserEventStore)),
  Effect.provide(CommandContextTest(Option.some('system-user' as any)))
);

Effect.runPromise(runnable);
```

## Core Concepts

### AggregateState

Represents the current state of an aggregate at a point in time:

```typescript
interface AggregateState<TData> {
  readonly nextEventNumber: EventNumber; // For optimistic concurrency
  readonly data: Option.Option<TData>; // None if aggregate doesn't exist
}
```

### makeAggregateRoot

The main function for creating aggregate roots with event sourcing capabilities:

```typescript
const MyAggregate = makeAggregateRoot(
  IdSchema, // Schema for aggregate ID validation
  applyEventFunction, // Function to apply events to state
  EventStoreTag, // Effect service tag for the event store
  commandHandlers // Object containing command handler functions
);

// Returns an object with:
// - new(): Creates empty aggregate state
// - load(id): Loads aggregate from event store
// - commit(options): Commits events to store
// - commands: Your command handlers
```

### Event Schema Creation

Use `eventSchema` to create properly structured domain events:

```typescript
const MyEvent = eventSchema(
  Schema.Literal('MyEventType'), // Event type discriminator
  {
    // Event data fields
    field1: Schema.String,
    field2: Schema.Number,
  }
);

// Results in schema for:
// {
//   type: 'MyEventType',
//   metadata: { occurredAt: Date, originator?: PersonId },
//   data: { field1: string, field2: number }
// }
```

### Command Context

Track command execution metadata:

```typescript
import { CommandContext, CommandContextTest } from '@codeforbreakfast/eventsourcing-aggregates';

const myCommand = pipe(
  CommandContext,
  Effect.flatMap((context) => context.getInitiatorId),
  Effect.map((initiatorId) => {
    // Use initiator information...
    return initiatorId;
  })
);

// Provide context for testing
const testLayer = CommandContextTest(Option.some('test-user-id' as any));
```

### Current User Service

Track the current user executing commands:

```typescript
import { CurrentUser } from '@codeforbreakfast/eventsourcing-aggregates';

const userAwareCommand = pipe(
  CurrentUser,
  Effect.flatMap((currentUserService) => currentUserService.getCurrentUser()),
  Effect.map((currentUser) => {
    // currentUser is Option.Option<PersonId>
    return currentUser;
  })
);
```

### Event Metadata Generation

Automatically generate event metadata with timestamps and originator:

```typescript
import { eventMetadata } from '@codeforbreakfast/eventsourcing-aggregates';

const createEvent = pipe(
  eventMetadata(),
  Effect.map((metadata) => ({
    type: 'SomethingHappened',
    metadata,
    data: {
      /* your event data */
    },
  }))
);
```

## Advanced Patterns

### Business Rule Validation

```typescript
const transferMoney =
  (toAccountId: string, amount: number) => (currentState: AggregateState<BankAccountState>) =>
    pipe(
      currentState.data,
      Option.match({
        onNone: () => Effect.fail(new Error('Account not found')),
        onSome: (account) => {
          // Validate business rules
          if (account.balance < amount) {
            return Effect.fail(new Error('Insufficient funds'));
          }
          if (amount <= 0) {
            return Effect.fail(new Error('Transfer amount must be positive'));
          }

          // Generate event with metadata
          // Note: fromAccountId is implicit from the stream, not in the event
          return pipe(
            eventMetadata(),
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
                // Note: accountId is NOT in the event - it's implicit from the stream
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
                    type: 'transfer',
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

describe('UserAggregate', () => {
  it('should register a new user', async () => {
    const program = pipe(
      // Start with a new aggregate
      Effect.succeed(UserAggregate.new()),
      Effect.flatMap((state) =>
        pipe(
          // Generate registration events
          UserAggregate.commands.registerUser('test@example.com', 'Test User')(state),
          Effect.tap((events) => {
            const event = Chunk.unsafeHead(events);
            expect(event.type).toBe('UserRegistered');
            expect(event.data.email).toBe('test@example.com');
            return Effect.unit;
          }),
          Effect.flatMap((events) =>
            // Apply the event to test state transformation
            pipe(
              Chunk.unsafeHead(events),
              applyUserEvent(state.data),
              Effect.tap((newState) => {
                expect(newState.email).toBe('test@example.com');
                expect(newState.isActive).toBe(true);
                return Effect.unit;
              })
            )
          )
        )
      )
    );

    await Effect.runPromise(
      pipe(program, Effect.provide(CommandContextTest(Option.some('test-initiator' as any))))
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

    const program = pipe(
      // Try to register a user that already exists
      UserAggregate.commands.registerUser('duplicate@example.com', 'Duplicate User')(existingState),
      Effect.either,
      Effect.tap((result) => {
        expect(result._tag).toBe('Left'); // Should fail
        return Effect.unit;
      })
    );

    await Effect.runPromise(
      pipe(program, Effect.provide(CommandContextTest(Option.some('test-initiator' as any))))
    );
  });
});
```

## Error Handling

Handle domain-specific errors with Effect's error management:

```typescript
import { Data } from 'effect';

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
import { Effect, Schema, Context } from 'effect';
import {
  CommandHandler,
  CommandRouter,
  createCommandProcessingService,
  CommandProcessingService,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { type EventStore } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

// 1. Define domain-specific events
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

// 2. Create domain-specific event store tag
const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);

// 3. Create typed command handlers
const createUserHandler: CommandHandler<UserEvent> = {
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

// 4. Create command router
const createUserRouter = (): CommandRouter<UserEvent> => ({
  route: (command) => {
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

// 5. Create the command processing service
const UserCommandProcessingService = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(UserEventStore)(createUserRouter())
);

// 6. Use the service
const processCommand = (command: WireCommand) =>
  pipe(
    CommandProcessingService,
    Effect.flatMap((service) => service.processCommand(command)),
    Effect.provide(UserCommandProcessingService),
    Effect.provide(userEventStoreLayer) // Provide your event store implementation
  );
```

### Key Principles

**⚠️ IMPORTANT: Never use generic `Event` types in domain code**

The `Event` type from `@codeforbreakfast/eventsourcing-store` has `data: Schema.Unknown` and is only for serialization boundaries (storage, wire protocol).

```typescript
// ❌ WRONG - Loses type safety
const handler: CommandHandler = {
  execute: () => Effect.succeed([{ type: 'UserCreated', data: { name: 'John' } } as Event]),
};

// ✅ CORRECT - Maintains type safety
const handler: CommandHandler<UserEvent> = {
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
// With in-memory store (for testing)
import { makeInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

const testProgram = pipe(
  myAggregateOperation,
  Effect.provide(makeInMemoryEventStore(MyEventStoreTag))
);

// With PostgreSQL store (separate package)
import { postgresEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';

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
