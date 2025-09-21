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
import { Effect, Option, pipe } from 'effect';
import {
  loadProjection,
  Projection,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';

// Define your events (same as in aggregates)
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

// Define your projection data model
interface UserProfile {
  userId: string;
  email: string;
  lastUpdated: string;
  registrationDate: string;
}

// Event application logic for projections
const applyUserEvent =
  (currentData: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, Error> => {
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
            onNone: () => Effect.fail(new Error(`User ${event.userId} not found for email update`)),
            onSome: (profile) =>
              Effect.succeed({
                ...profile,
                email: event.newEmail,
                lastUpdated: event.timestamp,
              }),
          })
        );

      default:
        // Handle unknown events gracefully
        return pipe(
          currentData,
          Option.match({
            onNone: () =>
              Effect.fail(new Error('Cannot process unknown event on empty projection')),
            onSome: (profile) => Effect.succeed(profile),
          })
        );
    }
  };

// Load and build projection
const loadUserProfile = loadProjection(ProjectionEventStore, applyUserEvent);

// Usage example
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
interface Projection<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}
```

The projection tracks both the data and the position in the event stream, enabling incremental updates.

### Loading Projections

The `loadProjection` function reconstructs projection state from events:

```typescript
const loadMyProjection = loadProjection(ProjectionEventStore, applyEventToProjection);

// Load specific projection
const projection = yield * loadMyProjection('projection-id');
```

## Advanced Projection Patterns

### Multi-Event Type Projections

Handle multiple related event types in a single projection:

```typescript
// Events from different aggregates
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
  (event: AllEvents): Effect.Effect<OrderSummary, Error> => {
    switch (event.type) {
      case 'OrderCreated':
        return Effect.succeed({
          orderId: event.orderId,
          status: 'pending',
          paymentStatus: 'pending',
          totalAmount: event.totalAmount,
        });

      case 'OrderShipped':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new Error('Order not found')),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                status: 'shipped',
                shippedDate: event.timestamp,
              }),
          })
        );

      case 'PaymentProcessed':
        return pipe(
          current,
          Option.match({
            onNone: () => Effect.fail(new Error('Order not found')),
            onSome: (summary) =>
              Effect.succeed({
                ...summary,
                paymentStatus: 'paid',
              }),
          })
        );

      // Handle other events...
    }
  };
```

### Projection with Validation

Add Schema validation to ensure data integrity:

```typescript
import { Schema, ParseResult } from 'effect';

const UserProfileSchema = Schema.Struct({
  userId: Schema.String,
  email: Schema.String.pipe(Schema.format('email')),
  lastUpdated: Schema.String,
  registrationDate: Schema.String,
});

const applyValidatedUserEvent =
  (current: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, ParseResult.ParseError | Error> =>
    pipe(applyUserEvent(current)(event), Effect.flatMap(Schema.decode(UserProfileSchema)));
```

### Conditional Projection Updates

Only update projections based on certain conditions:

```typescript
const applyConditionalEvent =
  (current: Option.Option<UserProfile>) =>
  (event: UserEvent): Effect.Effect<UserProfile, Error> => {
    // Only process events for active users
    if (current.pipe(Option.exists((profile) => !profile.isActive))) {
      return pipe(
        current,
        Option.match({
          onNone: () => Effect.fail(new Error('No current state')),
          onSome: (profile) => Effect.succeed(profile), // No change
        })
      );
    }

    return applyUserEvent(current)(event);
  };
```

## Real-Time Projection Updates

Process events as they arrive:

```typescript
import { Stream } from 'effect';

const processEventStream = (eventStream: Stream.Stream<UserEvent, Error>) =>
  pipe(
    ProjectionEventStore,
    Effect.flatMap(() =>
      pipe(
        eventStream,
        Stream.runForeach((event) =>
          pipe(
            loadUserProfile(event.userId),
            Effect.flatMap((projection) =>
              pipe(
                applyUserEvent(projection.data)(event),
                Effect.flatMap((updatedData) =>
                  saveProjection(event.userId, {
                    nextEventNumber: EventNumber(projection.nextEventNumber + 1),
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
const rebuildUserProjections = (userIds: string[]) =>
  Effect.forEach(
    userIds,
    (userId) =>
      pipe(
        Effect.logInfo(`Rebuilding projection for user ${userId}`),
        Effect.flatMap(() => loadUserProfile(userId)),
        Effect.flatMap((projection) => saveProjection(userId, projection)),
        Effect.flatMap(() => Effect.logInfo(`Completed rebuild for user ${userId}`))
      ),
    { concurrency: 10 } // Process 10 users concurrently
  );
```

## Error Handling and Recovery

Handle projection errors gracefully:

```typescript
import { Data } from 'effect';

class ProjectionError extends Data.TaggedError('ProjectionError')<{
  projectionId: string;
  eventType: string;
  message: string;
}> {}

const resilientProjectionUpdate = (projectionId: string, event: UserEvent) =>
  pipe(
    loadUserProfile(projectionId),
    Effect.flatMap((projection) => applyUserEvent(projection.data)(event)),
    Effect.catchAll((error) =>
      pipe(
        Effect.logError(`Projection update failed: ${error.message}`),
        Effect.flatMap(() => {
          if (error.message.includes('not found')) {
            return pipe(
              Effect.logWarning(`Skipping event for missing projection ${projectionId}`),
              Effect.map(() => Option.none<UserProfile>())
            );
          }

          return Effect.fail(
            new ProjectionError({
              projectionId,
              eventType: event.type,
              message: error.message,
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
import { Effect, Option } from 'effect';

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
// Instead of loading full user data, create specific projections
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

// Create focused projections for specific use cases
const loadUserEmail = loadProjection(ProjectionEventStore, applyEmailEvents);
const loadUserActivity = loadProjection(ProjectionEventStore, applyActivityEvents);
```

### Batch Processing

Process multiple events efficiently:

```typescript
const batchUpdateProjections = (events: UserEvent[]) =>
  pipe(
    Effect.succeed(groupBy(events, (event) => event.userId)),
    Effect.flatMap((eventsByUser) =>
      Effect.forEach(
        Object.entries(eventsByUser),
        ([userId, userEvents]) =>
          pipe(
            loadUserProfile(userId),
            Effect.flatMap((initialProjection) =>
              pipe(
                userEvents.reduce(
                  (acc, event) =>
                    pipe(
                      acc,
                      Effect.flatMap((projection) =>
                        pipe(
                          applyUserEvent(projection.data)(event),
                          Effect.map((updatedData) => ({
                            nextEventNumber: EventNumber(projection.nextEventNumber + 1),
                            data: Option.some(updatedData),
                          }))
                        )
                      )
                    ),
                  Effect.succeed(initialProjection)
                ),
                Effect.flatMap((finalProjection) => saveProjection(userId, finalProjection))
              )
            )
          ),
        { concurrency: 5 }
      )
    )
  );
```

## Integration with Event Store

This package works with the event store implementations:

```typescript
// With in-memory store (testing)
import { inMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

// With PostgreSQL store (production)
import { postgresEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';

const testLayer = inMemoryEventStore<UserEvent>();
const prodLayer = postgresEventStore<UserEvent>();

// Use the same projection logic with different stores
const runProjections = projection.pipe(
  Effect.provide(testLayer) // or prodLayer
);
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
