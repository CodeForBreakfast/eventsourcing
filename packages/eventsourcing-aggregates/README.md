# @codeforbreakfast/eventsourcing-aggregates

Aggregate root patterns for event sourcing with Effect integration. This package provides powerful abstractions for building aggregate roots that handle commands, emit events, and maintain consistency in your event-sourced applications.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-aggregates effect
```

```bash
bun add @codeforbreakfast/eventsourcing-aggregates effect
```

## Key Features

- **Aggregate Root Patterns**: Ready-to-use patterns for building domain aggregates
- **Effect Integration**: Built on Effect for composable, functional aggregate operations
- **Command Handling**: Type-safe command processing with Effect-based error handling
- **Event Sourcing**: Built-in support for event sourcing with automatic state rehydration
- **Concurrency Control**: Optimistic concurrency control to prevent race conditions
- **Testing Support**: Test-friendly APIs for unit testing aggregate behavior

## Quick Start

```typescript
import { Effect, Schema, pipe } from 'effect';
import {
  loadAggregate,
  commitEvents,
  AggregateState,
  CommandContext,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';

// Define your domain events
interface UserRegistered {
  type: 'UserRegistered';
  userId: string;
  email: string;
  timestamp: string;
}

interface UserEmailUpdated {
  type: 'UserEmailUpdated';
  userId: string;
  oldEmail: string;
  newEmail: string;
  timestamp: string;
}

type UserEvent = UserRegistered | UserEmailUpdated;

// Define your aggregate state
interface UserAggregate {
  userId: string;
  email: string;
  isActive: boolean;
}

// Define commands
interface RegisterUser {
  type: 'RegisterUser';
  userId: string;
  email: string;
}

interface UpdateUserEmail {
  type: 'UpdateUserEmail';
  userId: string;
  newEmail: string;
}

type UserCommand = RegisterUser | UpdateUserEmail;

// Event application logic
const applyUserEvent =
  (state: Option.Option<UserAggregate>) =>
  (event: UserEvent): Effect.Effect<UserAggregate, Error> => {
    switch (event.type) {
      case 'UserRegistered':
        return Effect.succeed({
          userId: event.userId,
          email: event.email,
          isActive: true,
        });

      case 'UserEmailUpdated':
        return pipe(
          state,
          Option.match({
            onNone: () => Effect.fail(new Error('User not found')),
            onSome: (user) =>
              Effect.succeed({
                ...user,
                email: event.newEmail,
              }),
          })
        );
    }
  };

// Command handling logic
const handleUserCommand =
  (aggregate: AggregateState<UserAggregate>) =>
  (command: UserCommand): Effect.Effect<UserEvent[], Error> => {
    switch (command.type) {
      case 'RegisterUser':
        return pipe(
          aggregate.data,
          Option.match({
            onNone: () =>
              Effect.succeed([
                {
                  type: 'UserRegistered' as const,
                  userId: command.userId,
                  email: command.email,
                  timestamp: new Date().toISOString(),
                },
              ]),
            onSome: () => Effect.fail(new Error('User already exists')),
          })
        );

      case 'UpdateUserEmail':
        return pipe(
          aggregate.data,
          Option.match({
            onNone: () => Effect.fail(new Error('User not found')),
            onSome: (user) =>
              Effect.succeed([
                {
                  type: 'UserEmailUpdated' as const,
                  userId: command.userId,
                  oldEmail: user.email,
                  newEmail: command.newEmail,
                  timestamp: new Date().toISOString(),
                },
              ]),
          })
        );
    }
  };

// Create aggregate processor using pipe composition
const processUserCommand = (command: UserCommand) =>
  pipe(
    Effect.all({
      context: CommandContext,
      eventStore: EventStore,
    }),
    Effect.flatMap(({ eventStore }) =>
      pipe(
        loadAggregate(eventStore, applyUserEvent)(command.userId),
        Effect.flatMap((aggregate) =>
          pipe(
            handleUserCommand(aggregate)(command),
            Effect.flatMap((events) =>
              pipe(
                commitEvents(eventStore)({
                  id: command.userId,
                  eventNumber: aggregate.nextEventNumber,
                  events: Chunk.fromIterable(events),
                }),
                Effect.map(() => events)
              )
            )
          )
        )
      )
    )
  );

// Usage example with pipe
const program = pipe(
  processUserCommand({
    type: 'RegisterUser',
    userId: 'user-123',
    email: 'user@example.com',
  }),
  Effect.tap((registrationEvents) =>
    Effect.logInfo(`Registration events: ${JSON.stringify(registrationEvents)}`)
  ),
  Effect.flatMap(() =>
    processUserCommand({
      type: 'UpdateUserEmail',
      userId: 'user-123',
      newEmail: 'newemail@example.com',
    })
  ),
  Effect.tap((updateEvents) => Effect.logInfo(`Update events: ${JSON.stringify(updateEvents)}`))
);
```

## Core Concepts

### Aggregate State

The `AggregateState` interface represents the current state of an aggregate:

```typescript
interface AggregateState<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}
```

### Loading Aggregates

Use `loadAggregate` to reconstruct aggregate state from events:

```typescript
const loadUserAggregate = loadAggregate(EventStore, applyUserEvent);

const userAggregate = yield * loadUserAggregate('user-123');
```

### Committing Events

Use `commitEvents` to persist new events to the event store:

```typescript
const commitUserEvents = commitEvents(EventStore);

yield *
  commitUserEvents({
    id: 'user-123',
    eventNumber: aggregate.nextEventNumber,
    events: Chunk.fromIterable(newEvents),
  });
```

## Command Context

The `CommandContext` service provides metadata about the current command execution:

```typescript
import { CommandContext, CommandInitiator } from '@codeforbreakfast/eventsourcing-aggregates';

const handleCommand = pipe(
  Effect.all({
    context: CommandContext,
    initiator: CommandInitiator,
  }),
  Effect.tap(({ context, initiator }) =>
    pipe(
      Effect.logInfo(`Command ID: ${context.commandId}`),
      Effect.flatMap(() => Effect.logInfo(`Initiated by: ${initiator.userId}`))
    )
  )
);
```

## Current User Context

Track who is executing commands:

```typescript
import { CurrentUser } from '@codeforbreakfast/eventsourcing-aggregates';

const userAwareCommand = (command: UserCommand) =>
  pipe(
    CurrentUser,
    Effect.flatMap((currentUser) =>
      handleUserCommand({
        ...command,
        initiatedBy: currentUser.id,
      })
    )
  );

// Provide user context
const program = pipe(
  userAwareCommand(command),
  Effect.provideService(CurrentUser, {
    id: 'user-456',
    email: 'admin@example.com',
  })
);
```

## Advanced Patterns

### Aggregate with Business Rules

```typescript
const handleTransferMoney =
  (aggregate: AggregateState<BankAccount>) =>
  (command: TransferMoney): Effect.Effect<BankAccountEvent[]> => {
    return pipe(
      aggregate.data,
      Option.match({
        onNone: () => Effect.fail(new Error('Account not found')),
        onSome: (account) =>
          account.balance < command.amount
            ? Effect.fail(new Error('Insufficient funds'))
            : Effect.succeed([
                {
                  type: 'MoneyTransferred' as const,
                  accountId: account.id,
                  amount: command.amount,
                  toAccount: command.toAccountId,
                  timestamp: new Date().toISOString(),
                },
              ]),
      })
    );
  };
```

### Event Validation

```typescript
const BankAccountEvent = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('AccountOpened'),
    accountId: Schema.String,
    initialBalance: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal('MoneyTransferred'),
    accountId: Schema.String,
    amount: Schema.Number.pipe(Schema.positive()),
    toAccount: Schema.String,
  })
);

const applyValidatedEvent =
  (state: Option.Option<BankAccount>) =>
  (event: unknown): Effect.Effect<BankAccount, ParseResult.ParseError> =>
    pipe(
      Schema.decode(BankAccountEvent)(event),
      Effect.flatMap((validEvent) => applyBankAccountEvent(state)(validEvent))
    );
```

## Testing Aggregates

The package provides utilities for testing aggregate behavior:

```typescript
import { Effect, Option } from 'effect';

// Test aggregate behavior in isolation
const testUserRegistration = pipe(
  Effect.succeed<AggregateState<UserAggregate>>({
    nextEventNumber: EventNumber(0),
    data: Option.none(),
  }),
  Effect.flatMap((initialState) =>
    pipe(
      handleUserCommand(initialState)({
        type: 'RegisterUser',
        userId: 'test-user',
        email: 'test@example.com',
      }),
      Effect.tap((events) =>
        Effect.sync(() => {
          expect(events).toHaveLength(1);
          expect(events[0].type).toBe('UserRegistered');
        })
      )
    )
  )
);
```

## Error Handling

Handle domain-specific errors with Effect's error management:

```typescript
class InsufficientFundsError extends Data.TaggedError('InsufficientFundsError')<{
  requiredAmount: number;
  availableBalance: number;
}> {}

class AccountNotFoundError extends Data.TaggedError('AccountNotFoundError')<{
  accountId: string;
}> {}

const handleWithDomainErrors = (command: BankCommand) =>
  pipe(
    processCommand(command),
    Effect.catchTag('InsufficientFundsError', (error) =>
      Effect.logError(
        `Not enough funds: need ${error.requiredAmount}, have ${error.availableBalance}`
      )
    ),
    Effect.catchTag('AccountNotFoundError', (error) =>
      Effect.logError(`Account ${error.accountId} not found`)
    )
  );
```

## Integration with Other Packages

This package works seamlessly with other packages in the ecosystem:

```typescript
// With PostgreSQL store
import { postgresEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';

// With projections
import { updateProjection } from '@codeforbreakfast/eventsourcing-projections';

// Complete setup
const program = pipe(
  processUserCommand(command),
  Effect.flatMap((events) =>
    pipe(
      updateProjection(ProjectionStore)(events),
      Effect.map(() => events)
    )
  ),
  Effect.provide(postgresEventStore),
  Effect.provide(projectionStoreLayer)
);
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Core event store interfaces
- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL implementation
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
