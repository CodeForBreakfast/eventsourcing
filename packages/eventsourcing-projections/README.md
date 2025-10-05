# @codeforbreakfast/eventsourcing-projections

Projection patterns for event sourcing with Effect integration. This package provides powerful abstractions for building read-side projections that transform event streams into optimized query models.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-projections effect
```

```bash
bun add @codeforbreakfast/eventsourcing-projections effect
```

## Key Features

- **Read-Side Projections**: Build optimized query models from event streams
- **Effect Integration**: Functional, composable projection processing
- **Type-Safe Event Handling**: Strongly-typed event processing with automatic type inference
- **Flexible Processing**: Support for both real-time and batch projection updates
- **Error Recovery**: Built-in error handling and retry mechanisms
- **Performance Optimized**: Efficient stream processing with backpressure handling

## Quick Start

```typescript
import { Context, Effect, Option, ParseResult, pipe } from 'effect';
import {
  loadProjection,
  MissingProjectionError,
  Projection,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';

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

interface UserProfile {
  userId: string;
  email: string;
  lastUpdated: string;
  registrationDate: string;
}

const applyUserEvent =
  (currentData: Option.Option<UserProfile>) =>
  (
    event: UserEvent
  ): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> => {
    switch (event.type) {
      case 'UserRegistered':
        return Effect.succeed({
          userId: event.userId,
          email: event.email,
          lastUpdated: event.timestamp,
          registrationDate: event.timestamp,
        });

      case 'UserEmailUpdated':
        return pipe(
          currentData,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MissingProjectionError({
                  message: `User ${event.userId} not found for email update`,
                })
              ),
            onSome: (profile) =>
              Effect.succeed({
                ...profile,
                email: event.newEmail,
                lastUpdated: event.timestamp,
              }),
          })
        );

      default:
        return pipe(
          currentData,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MissingProjectionError({
                  message: 'Cannot process unknown event on empty projection',
                })
              ),
            onSome: (profile) => Effect.succeed(profile),
          })
        );
    }
  };

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

const program = pipe(
  loadUserProfile('user-123'),
  Effect.tap((userProjection) =>
    pipe(
      Effect.logInfo(`User profile: ${JSON.stringify(userProjection.data)}`),
      Effect.flatMap(() => Effect.logInfo(`Next event number: ${userProjection.nextEventNumber}`))
    )
  )
);
```

## Core Concepts

### Projection Interface

```typescript
import { Option } from 'effect';
import { EventNumber } from '@codeforbreakfast/eventsourcing-projections';

interface Projection<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}
```

The projection tracks both the data and the position in the event stream, enabling incremental updates.

### Loading Projections

The `loadProjection` function reconstructs projection state from events:

```typescript
import { Context, Effect, Option, ParseResult, pipe } from 'effect';
import {
  loadProjection,
  MissingProjectionError,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';

interface MyEvent {
  type: string;
}

interface MyData {
  value: string;
}

const applyEventToProjection =
  (data: Option.Option<MyData>) =>
  (event: MyEvent): Effect.Effect<MyData, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ value: 'example' });

const MyEventStoreTag = Context.GenericTag<ProjectionEventStore<MyEvent>>('@services/MyEventStore');

const loadMyProjection = loadProjection(MyEventStoreTag, applyEventToProjection);

const loadSpecificProjection = pipe(
  loadMyProjection('projection-id'),
  Effect.map((projection) => projection)
);
```

## Advanced Projection Patterns

### Multi-Event Type Projections

Handle multiple related event types in a single projection:

```typescript
import { Effect, Option, ParseResult, pipe } from 'effect';
import { MissingProjectionError } from '@codeforbreakfast/eventsourcing-projections';

interface OrderCreated {
  type: 'OrderCreated';
  orderId: string;
  totalAmount: number;
}

interface OrderShipped {
  type: 'OrderShipped';
  orderId: string;
  timestamp: string;
}

interface OrderCancelled {
  type: 'OrderCancelled';
  orderId: string;
}

interface PaymentProcessed {
  type: 'PaymentProcessed';
  orderId: string;
}

interface PaymentFailed {
  type: 'PaymentFailed';
  orderId: string;
}

interface PaymentRefunded {
  type: 'PaymentRefunded';
  orderId: string;
}

type OrderEvent = OrderCreated | OrderShipped | OrderCancelled;
type PaymentEvent = PaymentProcessed | PaymentFailed | PaymentRefunded;
type AllEvents = OrderEvent | PaymentEvent;

interface OrderSummary {
  orderId: string;
  status: 'pending' | 'shipped' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  totalAmount: number;
  shippedDate?: string;
}

const applyOrderSummaryEvent =
  (current: Option.Option<OrderSummary>) =>
  (
    event: AllEvents
  ): Effect.Effect<OrderSummary, ParseResult.ParseError | MissingProjectionError> => {
    switch (event.type) {
      case 'OrderCreated':
        return Effect.succeed({
          orderId: event.orderId,
          status: 'pending' as const,
          paymentStatus: 'pending' as const,
          totalAmount: event.totalAmount,
        });

      case 'OrderShipped':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new MissingProjectionError({ message: 'Order not found' })),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                status: 'shipped' as const,
                shippedDate: event.timestamp,
              }),
          })
        );

      case 'PaymentProcessed':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new MissingProjectionError({ message: 'Order not found' })),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                paymentStatus: 'paid' as const,
              }),
          })
        );

      case 'OrderCancelled':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new MissingProjectionError({ message: 'Order not found' })),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                status: 'cancelled' as const,
              }),
          })
        );

      case 'PaymentFailed':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new MissingProjectionError({ message: 'Order not found' })),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                paymentStatus: 'failed' as const,
              }),
          })
        );

      case 'PaymentRefunded':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new MissingProjectionError({ message: 'Order not found' })),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                paymentStatus: 'refunded' as const,
              }),
          })
        );
    }
  };
```

### Projection with Validation

Add Schema validation to ensure data integrity:

```typescript
import { Effect, Option, ParseResult, Schema, pipe } from 'effect';
import { MissingProjectionError } from '@codeforbreakfast/eventsourcing-projections';

interface UserProfile {
  userId: string;
  email: string;
  lastUpdated: string;
  registrationDate: string;
}

interface UserEvent {
  type: string;
  userId: string;
}

const UserProfileSchema = Schema.Struct({
  userId: Schema.String,
  email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+$/)),
  lastUpdated: Schema.String,
  registrationDate: Schema.String,
});

const applyUserEvent =
  (current: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({
      userId: 'user-1',
      email: 'test@example.com',
      lastUpdated: '2024-01-01',
      registrationDate: '2024-01-01',
    });

const applyValidatedUserEvent =
  (current: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    pipe(applyUserEvent(current)(event), Effect.flatMap(Schema.decode(UserProfileSchema)));
```

### Conditional Projection Updates

Only update projections based on certain conditions:

```typescript
import { Effect, Option, ParseResult, pipe } from 'effect';
import { MissingProjectionError } from '@codeforbreakfast/eventsourcing-projections';

interface UserProfile {
  userId: string;
  email: string;
  isActive: boolean;
}

interface UserEvent {
  type: string;
  userId: string;
}

const applyUserEvent =
  (current: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: 'user-1', email: 'test@example.com', isActive: true });

const applyConditionalEvent =
  (current: Option.Option<UserProfile>) =>
  (
    event: UserEvent
  ): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> => {
    if (
      pipe(
        current,
        Option.exists((profile) => !profile.isActive)
      )
    ) {
      return pipe(
        current,
        Option.match({
          onNone: () => Effect.fail(new MissingProjectionError({ message: 'No current state' })),
          onSome: (profile) => Effect.succeed(profile),
        })
      );
    }

    return applyUserEvent(current)(event);
  };
```

## Real-Time Projection Updates

Process events as they arrive:

```typescript
import { Context, Effect, Option, ParseResult, Schema, Stream, pipe } from 'effect';
import {
  EventNumber,
  MissingProjectionError,
  Projection,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
}

interface UserProfile {
  userId: string;
  email: string;
}

const applyUserEvent =
  (data: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: 'test@example.com' });

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

const saveProjection = (id: string, projection: Projection<UserProfile>): Effect.Effect<void> =>
  Effect.void;

const processEventStream = (eventStream: Stream.Stream<UserEvent, never>) =>
  pipe(
    eventStream,
    Stream.runForEach((event: UserEvent) =>
      pipe(
        loadUserProfile(event.userId),
        Effect.flatMap((projection) =>
          pipe(
            applyUserEvent(projection.data)(event),
            Effect.flatMap((updatedData) =>
              pipe(
                projection.nextEventNumber + 1,
                Schema.decode(EventNumber),
                Effect.flatMap((nextEventNumber) =>
                  saveProjection(event.userId, {
                    nextEventNumber,
                    data: Option.some(updatedData),
                  })
                )
              )
            )
          )
        )
      )
    )
  );
```

## Batch Projection Rebuilding

Rebuild projections from historical events:

```typescript
import { Context, Effect, Option, ParseResult, pipe } from 'effect';
import {
  MissingProjectionError,
  Projection,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
}

interface UserProfile {
  userId: string;
  email: string;
}

const applyUserEvent =
  (data: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: 'test@example.com' });

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

const saveProjection = (id: string, projection: Projection<UserProfile>): Effect.Effect<void> =>
  Effect.void;

const rebuildUserProjections = (userIds: readonly string[]) =>
  Effect.forEach(
    userIds,
    (userId) =>
      pipe(
        Effect.logInfo(`Rebuilding projection for user ${userId}`),
        Effect.flatMap(() => loadUserProfile(userId)),
        Effect.flatMap((projection) => saveProjection(userId, projection)),
        Effect.flatMap(() => Effect.logInfo(`Completed rebuild for user ${userId}`))
      ),
    { concurrency: 10 }
  );
```

## Error Handling and Recovery

Handle projection errors gracefully:

```typescript
import { Context, Data, Effect, Option, ParseResult, pipe } from 'effect';
import {
  MissingProjectionError,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
}

interface UserProfile {
  userId: string;
  email: string;
}

class ProjectionError extends Data.TaggedError('ProjectionError')<{
  projectionId: string;
  eventType: string;
  message: string;
}> {}

const applyUserEvent =
  (data: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: 'test@example.com' });

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

const resilientProjectionUpdate = (projectionId: string, event: UserEvent) =>
  pipe(
    loadUserProfile(projectionId),
    Effect.flatMap((projection) => applyUserEvent(projection.data)(event)),
    Effect.map(Option.some),
    Effect.catchAll((error) =>
      pipe(
        Effect.logError(`Projection update failed: ${String(error)}`),
        Effect.flatMap(() => {
          const errorMessage =
            error instanceof MissingProjectionError ? error.message : String(error);
          if (errorMessage.includes('not found')) {
            return pipe(
              Effect.logWarning(`Skipping event for missing projection ${projectionId}`),
              Effect.map(() => Option.none<UserProfile>())
            );
          }

          return Effect.fail(
            new ProjectionError({
              projectionId,
              eventType: event.type,
              message: errorMessage,
            })
          );
        })
      )
    )
  );
```

## Testing Projections

Test projection logic in isolation:

```typescript
import { Effect, Option, ParseResult, pipe } from 'effect';
import { MissingProjectionError } from '@codeforbreakfast/eventsourcing-projections';

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

interface UserProfile {
  userId: string;
  email: string;
  lastUpdated: string;
  registrationDate: string;
}

const applyUserEvent =
  (currentData: Option.Option<UserProfile>) =>
  (
    event: UserEvent
  ): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> => {
    switch (event.type) {
      case 'UserRegistered':
        return Effect.succeed({
          userId: event.userId,
          email: event.email,
          lastUpdated: event.timestamp,
          registrationDate: event.timestamp,
        });

      case 'UserEmailUpdated':
        return pipe(
          currentData,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MissingProjectionError({ message: `User ${event.userId} not found` })
              ),
            onSome: (profile) =>
              Effect.succeed({
                ...profile,
                email: event.newEmail,
                lastUpdated: event.timestamp,
              }),
          })
        );
    }
  };

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe: (expected: unknown) => void };

describe('User Profile Projection', () => {
  test('should create profile on UserRegistered', () => {
    const event: UserRegistered = {
      type: 'UserRegistered',
      userId: 'user-123',
      email: 'test@example.com',
      timestamp: '2023-01-01T00:00:00Z',
    };

    const result = Effect.runSync(applyUserEvent(Option.none())(event));

    expect(result.userId).toBe('user-123');
    expect(result.email).toBe('test@example.com');
    expect(result.registrationDate).toBe('2023-01-01T00:00:00Z');
  });

  test('should update email on UserEmailUpdated', () => {
    const existingProfile: UserProfile = {
      userId: 'user-123',
      email: 'old@example.com',
      lastUpdated: '2023-01-01T00:00:00Z',
      registrationDate: '2023-01-01T00:00:00Z',
    };

    const event: UserEmailUpdated = {
      type: 'UserEmailUpdated',
      userId: 'user-123',
      oldEmail: 'old@example.com',
      newEmail: 'new@example.com',
      timestamp: '2023-01-02T00:00:00Z',
    };

    const result = Effect.runSync(applyUserEvent(Option.some(existingProfile))(event));

    expect(result.email).toBe('new@example.com');
    expect(result.lastUpdated).toBe('2023-01-02T00:00:00Z');
  });
});
```

## Performance Considerations

### Optimize for Read Patterns

Design projections based on your query patterns:

```typescript
import { Context, Effect, Option, ParseResult } from 'effect';
import {
  MissingProjectionError,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
  email?: string;
  loginDate?: string;
}

interface UserEmailLookup {
  userId: string;
  email: string;
}

interface UserActivitySummary {
  userId: string;
  lastLoginDate: string;
  loginCount: number;
  isActive: boolean;
}

const applyEmailEvents =
  (data: Option.Option<UserEmailLookup>) =>
  (
    event: UserEvent
  ): Effect.Effect<UserEmailLookup, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: event.email ?? 'unknown@example.com' });

const applyActivityEvents =
  (data: Option.Option<UserActivitySummary>) =>
  (
    event: UserEvent
  ): Effect.Effect<UserActivitySummary, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({
      userId: event.userId,
      lastLoginDate: event.loginDate ?? '2024-01-01',
      loginCount: 1,
      isActive: true,
    });

const UserEmailEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEmailEventStore'
);
const UserActivityEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserActivityEventStore'
);

const loadUserEmail = loadProjection(UserEmailEventStoreTag, applyEmailEvents);
const loadUserActivity = loadProjection(UserActivityEventStoreTag, applyActivityEvents);
```

### Batch Processing

Process multiple events efficiently:

```typescript
import { Array, Context, Effect, Option, ParseResult, Schema, pipe } from 'effect';
import {
  EventNumber,
  MissingProjectionError,
  Projection,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
}

interface UserProfile {
  userId: string;
  email: string;
}

const applyUserEvent =
  (data: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: 'test@example.com' });

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

const saveProjection = (id: string, projection: Projection<UserProfile>): Effect.Effect<void> =>
  Effect.void;

const groupBy = <T>(items: readonly T[], keyFn: (item: T) => string): Record<string, T[]> =>
  items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      return { ...acc, [key]: [...(acc[key] ?? []), item] };
    },
    {} as Record<string, T[]>
  );

const applyEventsToProjection = (
  projection: Projection<UserProfile>,
  events: readonly UserEvent[]
): Effect.Effect<Projection<UserProfile>, ParseResult.ParseError | MissingProjectionError> => {
  const applyEvent = (
    currentProjection: Projection<UserProfile>,
    event: UserEvent
  ): Effect.Effect<Projection<UserProfile>, ParseResult.ParseError | MissingProjectionError> =>
    pipe(
      applyUserEvent(currentProjection.data)(event),
      Effect.flatMap((updatedData) =>
        pipe(
          currentProjection.nextEventNumber + 1,
          Schema.decode(EventNumber),
          Effect.map(
            (nextEventNumber): Projection<UserProfile> => ({
              nextEventNumber,
              data: Option.some(updatedData),
            })
          )
        )
      )
    );

  return pipe(
    events,
    Array.reduce(
      Effect.succeed(projection) as Effect.Effect<
        Projection<UserProfile>,
        ParseResult.ParseError | MissingProjectionError
      >,
      (accEffect, event) =>
        pipe(
          accEffect,
          Effect.flatMap((proj) => applyEvent(proj, event))
        )
    )
  );
};

const batchUpdateProjections = (events: readonly UserEvent[]) =>
  pipe(
    groupBy(events, (event) => event.userId),
    Object.entries,
    Effect.forEach(
      ([userId, userEvents]) =>
        pipe(
          loadUserProfile(userId),
          Effect.flatMap((initialProjection) =>
            pipe(
              applyEventsToProjection(initialProjection, userEvents),
              Effect.flatMap((finalProjection) => saveProjection(userId, finalProjection))
            )
          )
        ),
      { concurrency: 5 }
    )
  );
```

## Integration with Event Store

This package works with the event store implementations:

```typescript
import { Context, Effect, Layer, Option, ParseResult, pipe } from 'effect';
import {
  MissingProjectionError,
  ProjectionEventStore,
  loadProjection,
} from '@codeforbreakfast/eventsourcing-projections';

interface UserEvent {
  type: string;
  userId: string;
}

interface UserProfile {
  userId: string;
  email: string;
}

const applyUserEvent =
  (data: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | MissingProjectionError> =>
    Effect.succeed({ userId: event.userId, email: 'test@example.com' });

const UserEventStoreTag = Context.GenericTag<ProjectionEventStore<UserEvent>>(
  '@services/UserEventStore'
);

const loadUserProfile = loadProjection(UserEventStoreTag, applyUserEvent);

declare const inMemoryEventStore: <TEvent>() => Layer.Layer<ProjectionEventStore<TEvent>>;
declare const postgresEventStore: <TEvent>() => Layer.Layer<ProjectionEventStore<TEvent>>;

const testLayer = inMemoryEventStore<UserEvent>();
const prodLayer = postgresEventStore<UserEvent>();

const projection = loadUserProfile('user-123');

const runProjections = pipe(projection, Effect.provide(testLayer));
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Core event store interfaces
- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL implementation
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Write-side aggregate patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
