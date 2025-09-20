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
# Core event store functionality
bun add @codeforbreakfast/eventsourcing-store

# Aggregate root patterns
bun add @codeforbreakfast/eventsourcing-aggregates

# Projection patterns
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

// For production - use SQL store
import { SqlEventStore } from '@codeforbreakfast/eventsourcing-store';
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

```typescript
import { aggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import { Schema, Effect } from 'effect';

// Define aggregate state
interface UserState {
  userId: string;
  email: string;
  name?: string;
  registered: boolean;
}

// Define commands
const RegisterUser = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
});

const UpdateProfile = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
});

// Create aggregate root
const UserAggregate = aggregateRoot<UserEvent, UserState>({
  eventSchema: Schema.Union(UserRegistered, UserProfileUpdated),

  applyEvent: (state, event) => {
    switch (event.type) {
      case 'UserRegistered':
        return {
          ...state,
          userId: event.userId,
          email: event.email,
          registered: true,
        };
      case 'UserProfileUpdated':
        return {
          ...state,
          name: event.name,
        };
      default:
        return state;
    }
  },

  initialState: () => ({
    userId: '',
    email: '',
    registered: false,
  }),

  commands: {
    register: (command: typeof RegisterUser.Type) =>
      Effect.gen(function* () {
        const state = yield* aggregateRoot.getState();

        if (state.registered) {
          return yield* Effect.fail(new Error('User already registered'));
        }

        yield* aggregateRoot.emit(
          UserRegistered.make({
            type: 'UserRegistered',
            userId: command.userId,
            email: command.email,
            registeredAt: new Date(),
          })
        );
      }),

    updateProfile: (command: typeof UpdateProfile.Type) =>
      Effect.gen(function* () {
        const state = yield* aggregateRoot.getState();

        if (!state.registered) {
          return yield* Effect.fail(new Error('User not registered'));
        }

        yield* aggregateRoot.emit(
          UserProfileUpdated.make({
            type: 'UserProfileUpdated',
            userId: command.userId,
            name: command.name,
            updatedAt: new Date(),
          })
        );
      }),
  },
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
import { EventStore } from '@codeforbreakfast/eventsourcing-store';

const writeEvents = EventStore.writeExpectedVersion({
  streamId: 'user-123',
  events: [event1, event2],
  expectedVersion: 5, // Will fail if stream version != 5
});
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
import { TestClock, Effect } from 'effect';
import { InMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

describe('UserAggregate', () => {
  it('should register user', async () => {
    const program = Effect.gen(function* () {
      const aggregate = yield* UserAggregate.load('user-123');

      yield* aggregate.register({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const events = yield* EventStore.read({
        streamId: 'user-123',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('UserRegistered');
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

// After (codeforbreakfast)
const events = await Effect.runPromise(EventStore.read({ streamId: 'user-123' }));
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
