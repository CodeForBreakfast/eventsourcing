# @codeforbreakfast/eventsourcing Usage Guide

A comprehensive event sourcing library built on Effect for TypeScript applications.

## Core Principle

This library embraces Effect's existing APIs and patterns. Rather than inventing new abstractions, we expose event sourcing through familiar Effect constructs:

- **Events** are defined using `Schema` for type safety and validation
- **Event streams** are exposed as Effect `Stream` types
- **Operations** return `Effect` types with proper error handling
- **Services** use Effect's `Layer` system for dependency injection
- **Concurrency** leverages Effect's built-in primitives

If you know Effect, you already know how to use this library.

## Installation

Install the packages you need:

```bash
# Core event store functionality (interfaces + in-memory)
bun add @codeforbreakfast/eventsourcing-store

# PostgreSQL implementation (if needed)
bun add @codeforbreakfast/eventsourcing-store-postgres

# Aggregate root patterns (write-side)
bun add @codeforbreakfast/eventsourcing-aggregates

# Projection patterns (read-side)
bun add @codeforbreakfast/eventsourcing-projections

# WebSocket transport for real-time streaming
bun add @codeforbreakfast/eventsourcing-websocket-transport

# Don't forget Effect as a peer dependency
bun add effect
```

## Basic Usage

### 1. Define Your Events

```typescript
import { Schema } from 'effect';

// Define your domain events
export const UserRegistered = Schema.Struct({
  type: Schema.Literal('UserRegistered'),
  userId: Schema.String,
  email: Schema.String,
  registeredAt: Schema.Date,
});

export const UserProfileUpdated = Schema.Struct({
  type: Schema.Literal('UserProfileUpdated'),
  userId: Schema.String,
  name: Schema.String,
  updatedAt: Schema.Date,
});

// Union of all events
export type UserEvent = Schema.Schema.Type<typeof UserRegistered | typeof UserProfileUpdated>;
```

### 2. Set Up Event Store

```typescript
import { Effect, Layer } from 'effect';
import { InMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

// For development/testing - use in-memory store
const EventStoreLive = InMemoryEventStore.Live;

// For production - use PostgreSQL store
import { SqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import { PgClient } from '@effect/sql-pg';

const EventStoreLive = SqlEventStore.Live.pipe(
  Layer.provide(
    PgClient.layer({
      database: 'myapp',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'password',
    })
  )
);
```

### 3. Create an Aggregate

> **Note: Aggregate Command Pattern**
>
> Commands in this library follow a functional pattern where:
>
> - Commands are functions that take domain parameters (not aggregate IDs)
> - Commands return a function that accepts the current state
> - The aggregate ID is only needed when loading and committing
> - This separation allows commands to focus on business logic without infrastructure concerns

```typescript
import { createAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import { Schema, Effect, Option, Chunk } from 'effect';

// Define aggregate state
interface UserState {
  userId: string;
  email: string;
  name?: string;
  registered: boolean;
}

// Create aggregate root with event application and commands
const UserAggregate = createAggregateRoot(
  // ID schema
  Schema.String,

  // Apply function: reduces events to state
  (state: Option.Option<UserState>) => (event: UserEvent) => {
    const current = Option.getOrElse(state, () => ({
      userId: '',
      email: '',
      registered: false,
    }));

    switch (event.type) {
      case 'UserRegistered':
        return Effect.succeed({
          ...current,
          userId: event.userId,
          email: event.email,
          registered: true,
        });
      case 'UserProfileUpdated':
        return Effect.succeed({
          ...current,
          name: event.name,
        });
      default:
        return Effect.succeed(current);
    }
  },

  // Event store tag for dependency injection
  UserEventStore,

  // Commands: functions that take parameters and return a state transformer
  {
    register: (userId: string, email: string) => (state: Option.Option<UserState>) =>
      Effect.gen(function* () {
        if (Option.isSome(state) && state.value.registered) {
          return yield* Effect.fail(new Error('User already registered'));
        }

        // Commands return a Chunk of events to be emitted
        return Chunk.of({
          type: 'UserRegistered' as const,
          userId,
          email,
          registeredAt: new Date(),
        });
      }),

    updateProfile: (name: string) => (state: Option.Option<UserState>) =>
      Effect.gen(function* () {
        if (Option.isNone(state) || !state.value.registered) {
          return yield* Effect.fail(new Error('User not registered'));
        }

        return Chunk.of({
          type: 'UserProfileUpdated' as const,
          userId: state.value.userId,
          name,
          updatedAt: new Date(),
        });
      }),
  }
);

// Using the aggregate
const program = Effect.gen(function* () {
  const userId = 'user-123';

  // Load the aggregate (returns state and next event number)
  const loaded = yield* UserAggregate.load(userId);

  // Execute a command against the state
  const events = yield* pipe(
    loaded.data, // The current state (Option<UserState>)
    UserAggregate.commands.register(userId, 'test@example.com')
  );

  // Commit the events with explicit ID and event number
  yield* UserAggregate.commit(userId, loaded.nextEventNumber)(events);
});
```

### 4. Build Projections

```typescript
import { Effect } from 'effect';
import { projection } from '@codeforbreakfast/eventsourcing-projections';

// Define projection state
interface UserListProjection {
  users: Array<{
    userId: string;
    email: string;
    name?: string;
  }>;
}

// Create projection
const userListProjection = projection<UserEvent, UserListProjection>({
  streamId: 'all-users',

  initialState: { users: [] },

  applyEvent: (state, event) => {
    switch (event.type) {
      case 'UserRegistered':
        return {
          users: [
            ...state.users,
            {
              userId: event.userId,
              email: event.email,
            },
          ],
        };
      case 'UserProfileUpdated':
        return {
          users: state.users.map((u) =>
            u.userId === event.userId ? { ...u, name: event.name } : u
          ),
        };
      default:
        return state;
    }
  },
});

// Use projection
const program = Effect.gen(function* () {
  const projection = yield* userListProjection.load();
  console.log('Current users:', projection.data.users);
});
```

### 5. Real-time Event Streaming with WebSockets

```typescript
import { WebSocketTransport } from '@codeforbreakfast/eventsourcing-websocket-transport';
import { Stream, Effect } from 'effect';

// Set up WebSocket transport
const transport = WebSocketTransport.make({
  url: 'ws://localhost:8080/events',
});

// Subscribe to events
const subscription = transport.subscribe('user-events').pipe(
  Stream.tap((event) => Effect.log(`Received event: ${event.type}`)),
  Stream.runDrain
);

// Run with proper resource management
Effect.runPromise(subscription.pipe(Effect.scoped, Effect.provide(WebSocketTransportLive)));
```

## Advanced Patterns

### Event Metadata

```typescript
import { eventMetadata } from '@codeforbreakfast/eventsourcing-aggregates';

const enrichedEvent = {
  ...event,
  metadata: eventMetadata({
    occurredAt: new Date(),
    occurredBy: 'user-123',
    correlationId: 'req-456',
    causationId: 'cmd-789',
  }),
};
```

### Optimistic Concurrency

```typescript
import { EventStore, positionAfter, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import { Stream } from 'effect';

// Write events at a specific position for optimistic concurrency
const writeEventsWithConcurrency = pipe(
  Effect.all({
    eventStore: EventStore,
    streamId: toStreamId('user-123'),
  }),
  Effect.flatMap(({ eventStore, streamId }) =>
    pipe(
      // Position after event 5 - will fail if stream has advanced beyond this
      positionAfter(EventNumber(5))(streamId),
      Effect.flatMap((position) =>
        pipe(Stream.fromIterable([event1, event2]), Stream.run(eventStore.append(position)))
      )
    )
  )
);
```

### Snapshots

```typescript
// Save aggregate state periodically
const snapshot = Effect.gen(function* () {
  const state = yield* aggregateRoot.getState();
  const version = yield* aggregateRoot.getVersion();

  if (version % 10 === 0) {
    // Every 10 events
    yield* SnapshotStore.save({
      aggregateId: state.userId,
      version,
      state,
    });
  }
});
```

## Testing

```typescript
import { TestClock, Effect, pipe } from 'effect';
import { InMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

describe('UserAggregate', () => {
  it('should register user', async () => {
    const program = Effect.gen(function* () {
      const userId = 'user-123';

      // Load aggregate to get initial state
      const loaded = yield* UserAggregate.load(userId);

      // Execute command to get events
      const events = yield* pipe(
        loaded.data,
        UserAggregate.commands.register(userId, 'test@example.com')
      );

      // Commit the events
      yield* UserAggregate.commit(userId, loaded.nextEventNumber)(events);

      // Read back from event store to verify
      const storedEvents = yield* EventStore.read({
        streamId: userId,
      });

      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].type).toBe('UserRegistered');
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(InMemoryEventStore.Live), Effect.provide(TestClock.layer))
    );
  });
});
```

## Error Handling

All operations return Effect types with typed errors:

```typescript
import { EventStoreError } from '@codeforbreakfast/eventsourcing-store';

const program = EventStore.read({ streamId: 'user-123' }).pipe(
  Effect.catchTag('EventStoreError', (error) =>
    Effect.log(`Failed to read events: ${error.message}`)
  ),
  Effect.catchTag(
    'StreamNotFoundError',
    () => Effect.succeed([]) // Return empty array for missing streams
  )
);
```

## Performance Tips

1. **Use projections** for read-heavy operations instead of replaying events
2. **Implement snapshots** for aggregates with many events
3. **Use WebSocket transport** for real-time updates instead of polling
4. **Batch writes** when possible to reduce database round-trips
5. **Consider event archiving** for old events that are rarely accessed

## Migration from Other Event Sourcing Libraries

### From EventStore DB

```typescript
// Before (EventStore DB)
const events = await eventStore.readStreamEvents('user-123');

// After (codeforbreakfast) - for historical events only
const events = await Effect.runPromise(EventStore.read({ streamId: 'user-123' }));

// After (codeforbreakfast) - for historical + live events
const events = await Effect.runPromise(EventStore.subscribe({ streamId: 'user-123' }));
```

### From Axon Framework

```typescript
// Before (Axon)
@CommandHandler
public void handle(RegisterUserCommand cmd) {
  apply(new UserRegisteredEvent(cmd.userId, cmd.email));
}

// After (codeforbreakfast)
register: (cmd) => Effect.gen(function* () {
  yield* aggregateRoot.emit(UserRegistered.make({
    type: "UserRegistered",
    userId: cmd.userId,
    email: cmd.email,
  }));
})
```

## License

MIT
