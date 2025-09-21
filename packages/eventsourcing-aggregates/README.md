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
- **Command Context Tracking**: Built-in command tracking with user attribution
- **Event Metadata**: Automatic timestamping and originator tracking for all events
- **Effect Integration**: Built on Effect for composable, functional aggregate operations
- **Testing Support**: Test-friendly APIs for unit testing aggregate behavior

## Core Exports

```typescript
import {
  // Main aggregate creation function
  createAggregateRoot,

  // Core interfaces and types
  AggregateState,
  EventMetadata,
  EventOriginatorId,

  // Command context services
  CommandContext,
  CommandContextInterface,
  CommandInitiatorId,

  // Current user services
  CurrentUser,
  CurrentUserServiceInterface,
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
  createAggregateRoot,
  AggregateState,
  CommandContext,
  eventSchema,
  eventMetadata,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { makeInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

// 1. Define your aggregate ID schema
const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

// 2. Define your domain events using eventSchema
const UserRegisteredEvent = eventSchema(Schema.Literal('UserRegistered'), {
  userId: UserId,
  email: Schema.String,
  name: Schema.String,
});

const UserEmailUpdatedEvent = eventSchema(Schema.Literal('UserEmailUpdated'), {
  userId: UserId,
  oldEmail: Schema.String,
  newEmail: Schema.String,
});

const UserEvent = Schema.Union(UserRegisteredEvent, UserEmailUpdatedEvent);
type UserEvent = typeof UserEvent.Type;

// 3. Define your aggregate state
interface UserState {
  userId: UserId;
  email: string;
  name: string;
  isActive: boolean;
}

// 4. Create the event application function
const applyUserEvent = (state: Option.Option<UserState>) => (event: UserEvent) =>
  Effect.gen(function* () {
    switch (event.type) {
      case 'UserRegistered':
        return {
          userId: event.data.userId,
          email: event.data.email,
          name: event.data.name,
          isActive: true,
        };

      case 'UserEmailUpdated':
        if (Option.isNone(state)) {
          return yield* Effect.fail(new Error('Cannot update email: user does not exist'));
        }
        return {
          ...state.value,
          email: event.data.newEmail,
        };

      default:
        return yield* Effect.fail(new Error(`Unknown event type: ${(event as any).type}`));
    }
  });

// 5. Create event store tag
class UserEventStore extends Context.Tag('UserEventStore')<
  UserEventStore,
  EventStore<UserEvent>
>() {}

// 6. Define command handlers
const registerUser = (userId: UserId, email: string, name: string) =>
  Effect.gen(function* () {
    const metadata = yield* eventMetadata();

    return {
      type: 'UserRegistered' as const,
      metadata,
      data: { userId, email, name },
    } satisfies UserEvent;
  });

const updateUserEmail =
  (userId: UserId, newEmail: string) => (currentState: AggregateState<UserState>) =>
    Effect.gen(function* () {
      if (Option.isNone(currentState.data)) {
        return yield* Effect.fail(new Error('User not found'));
      }

      const metadata = yield* eventMetadata();
      const oldEmail = currentState.data.value.email;

      return {
        type: 'UserEmailUpdated' as const,
        metadata,
        data: { userId, oldEmail, newEmail },
      } satisfies UserEvent;
    });

// 7. Create the aggregate root
const UserAggregate = createAggregateRoot(UserId, applyUserEvent, UserEventStore, {
  registerUser,
  updateUserEmail,
});

// 8. Usage example
const program = Effect.gen(function* () {
  // Create a new user
  const newUser = UserAggregate.new();
  console.log('New user state:', newUser);

  // Load an existing user (returns empty state if not found)
  const existingUser = yield* UserAggregate.load('user-123');
  console.log('Loaded user:', existingUser);

  // Generate events
  const registrationEvent = yield* UserAggregate.commands.registerUser(
    'user-123' as UserId,
    'john@example.com',
    'John Doe'
  );

  // Commit events to store
  yield* UserAggregate.commit({
    id: 'user-123',
    eventNumber: existingUser.nextEventNumber,
    events: Chunk.of(registrationEvent),
  });

  // Load updated state
  const updatedUser = yield* UserAggregate.load('user-123');
  console.log('User after registration:', updatedUser);

  // Update email
  const emailUpdateEvent = yield* UserAggregate.commands.updateUserEmail(
    'user-123' as UserId,
    'john.doe@newdomain.com'
  )(updatedUser);

  yield* UserAggregate.commit({
    id: 'user-123',
    eventNumber: updatedUser.nextEventNumber,
    events: Chunk.of(emailUpdateEvent),
  });
});

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

### createAggregateRoot

The main function for creating aggregate roots with event sourcing capabilities:

```typescript
const MyAggregate = createAggregateRoot(
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

const myCommand = Effect.gen(function* () {
  const context = yield* CommandContext;
  const initiatorId = yield* context.getInitiatorId;
  // Use initiator information...
});

// Provide context for testing
const testLayer = CommandContextTest(Option.some('test-user-id' as any));
```

### Current User Service

Track the current user executing commands:

```typescript
import { CurrentUser } from '@codeforbreakfast/eventsourcing-aggregates';

const userAwareCommand = Effect.gen(function* () {
  const currentUserService = yield* CurrentUser;
  const currentUser = currentUserService.getCurrentUser();
  // currentUser is Option.Option<PersonId>
});
```

### Event Metadata Generation

Automatically generate event metadata with timestamps and originator:

```typescript
import { eventMetadata } from '@codeforbreakfast/eventsourcing-aggregates';

const createEvent = Effect.gen(function* () {
  const metadata = yield* eventMetadata();
  // metadata: { occurredAt: Date, originator?: PersonId }

  return {
    type: 'SomethingHappened',
    metadata,
    data: {
      /* your event data */
    },
  };
});
```

## Advanced Patterns

### Business Rule Validation

```typescript
const transferMoney =
  (fromAccountId: string, toAccountId: string, amount: number) =>
  (currentState: AggregateState<BankAccountState>) =>
    Effect.gen(function* () {
      if (Option.isNone(currentState.data)) {
        return yield* Effect.fail(new Error('Account not found'));
      }

      const account = currentState.data.value;

      if (account.balance < amount) {
        return yield* Effect.fail(new Error('Insufficient funds'));
      }

      if (amount <= 0) {
        return yield* Effect.fail(new Error('Transfer amount must be positive'));
      }

      const metadata = yield* eventMetadata();

      return {
        type: 'MoneyTransferred' as const,
        metadata,
        data: { fromAccountId, toAccountId, amount },
      };
    });
```

### Complex Event Application

```typescript
const applyBankAccountEvent =
  (state: Option.Option<BankAccountState>) => (event: BankAccountEvent) =>
    Effect.gen(function* () {
      switch (event.type) {
        case 'AccountOpened':
          if (Option.isSome(state)) {
            return yield* Effect.fail(new Error('Account already exists'));
          }
          return {
            accountId: event.data.accountId,
            balance: event.data.initialDeposit,
            isActive: true,
            transactions: [],
          };

        case 'MoneyTransferred':
          if (Option.isNone(state)) {
            return yield* Effect.fail(new Error('Account does not exist'));
          }
          return {
            ...state.value,
            balance: state.value.balance - event.data.amount,
            transactions: [
              ...state.value.transactions,
              {
                type: 'transfer',
                amount: event.data.amount,
                timestamp: event.metadata.occurredAt,
              },
            ],
          };

        default:
          return yield* Effect.fail(new Error(`Unknown event: ${(event as any).type}`));
      }
    });
```

### Testing Aggregates

Test aggregate behavior in isolation:

```typescript
import { describe, it, expect } from 'vitest';

describe('UserAggregate', () => {
  it('should register a new user', async () => {
    const program = Effect.gen(function* () {
      // Test command generation
      const event = yield* UserAggregate.commands.registerUser(
        'test-user' as UserId,
        'test@example.com',
        'Test User'
      );

      expect(event.type).toBe('UserRegistered');
      expect(event.data.email).toBe('test@example.com');

      // Test event application
      const initialState = UserAggregate.new();
      const newState = yield* applyUserEvent(initialState.data)(event);

      expect(newState.email).toBe('test@example.com');
      expect(newState.isActive).toBe(true);
    });

    await Effect.runPromise(
      pipe(program, Effect.provide(CommandContextTest(Option.some('test-initiator' as any))))
    );
  });

  it('should prevent duplicate registration', async () => {
    const program = Effect.gen(function* () {
      const existingState: AggregateState<UserState> = {
        nextEventNumber: 1,
        data: Option.some({
          userId: 'existing-user' as UserId,
          email: 'existing@example.com',
          name: 'Existing User',
          isActive: true,
        }),
      };

      // This should fail because user already exists
      const result = yield* Effect.either(
        UserAggregate.commands.registerUser(
          'existing-user' as UserId,
          'duplicate@example.com',
          'Duplicate User'
        )
      );

      expect(result._tag).toBe('Left'); // Should fail
    });

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
