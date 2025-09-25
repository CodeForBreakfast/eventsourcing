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
bun add @codeforbreakfast/eventsourcing-transport-websocket

# Don't forget Effect as a peer dependency
bun add effect
```

## Basic Usage

### 1. Define Your Events

```typescript
import { Schema } from 'effect';

// Define your domain events
// Note: Events don't contain aggregate IDs - those come from the event stream
export const UserRegistered = Schema.Struct({
  type: Schema.Literal('UserRegistered'),
  email: Schema.String,
  registeredAt: Schema.Date,
});

export const UserProfileUpdated = Schema.Struct({
  type: Schema.Literal('UserProfileUpdated'),
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
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStoreService } from '@codeforbreakfast/eventsourcing-store';
import { Schema, Effect, Option, Chunk, pipe } from 'effect';

// Define aggregate state
// Note: Aggregate state doesn't need to store its own ID - that's implicit from the stream
interface UserState {
  email: string;
  name?: string;
  registered: boolean;
}

// Create aggregate root with event application and commands
const UserAggregate = makeAggregateRoot(
  // ID schema
  Schema.String,

  // Apply function: reduces events to state
  (state: Option.Option<UserState>) => (event: UserEvent) =>
    pipe(
      state,
      Option.getOrElse(() => ({
        email: '',
        registered: false,
      })),
      (current) => {
        switch (event.type) {
          case 'UserRegistered':
            return Effect.succeed({
              ...current,
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
      }
    ),

  // Event store tag for dependency injection
  EventStoreService,

  // Commands: functions that take parameters and return a state transformer
  // Note: Commands don't include aggregate IDs - those are implicit from the stream
  {
    register: (email: string) => (state: Option.Option<UserState>) =>
      pipe(
        state,
        Option.match({
          onNone: () =>
            Effect.succeed(
              Chunk.of({
                type: 'UserRegistered' as const,
                email,
                registeredAt: new Date(),
              })
            ),
          onSome: (s) =>
            s.registered
              ? Effect.fail(new Error('User already registered'))
              : Effect.succeed(
                  Chunk.of({
                    type: 'UserRegistered' as const,
                    email,
                    registeredAt: new Date(),
                  })
                ),
        }),
        Effect.flatten
      ),

    updateProfile: (name: string) => (state: Option.Option<UserState>) =>
      pipe(
        state,
        Option.match({
          onNone: () => Effect.fail(new Error('User not registered')),
          onSome: (s) =>
            !s.registered
              ? Effect.fail(new Error('User not registered'))
              : Effect.succeed(
                  Chunk.of({
                    type: 'UserProfileUpdated' as const,
                    name,
                    updatedAt: new Date(),
                  })
                ),
        }),
        Effect.flatten
      ),
  }
);

// Using the aggregate
const userId = 'user-123'; // The aggregate ID is only used for loading/committing

const program = pipe(
  UserAggregate.load(userId),
  Effect.flatMap((loaded) =>
    pipe(
      // Execute command on the loaded state (no ID needed in command)
      UserAggregate.commands.register('test@example.com')(loaded.data),
      // Commit the resulting events with the aggregate ID
      Effect.flatMap((events) =>
        UserAggregate.commit({
          id: userId,
          eventNumber: loaded.nextEventNumber,
          events,
        })
      )
    )
  )
);
```

### 4. Build Projections

```typescript
import { Effect, pipe, ReadonlyArray } from 'effect';
import { projection } from '@codeforbreakfast/eventsourcing-projections';

// Define projection state with immutable array
interface UserListProjection {
  readonly users: ReadonlyArray<{
    readonly userId: string; // This comes from the stream ID, not the event
    readonly email: string;
    readonly name?: string;
  }>;
}

// Create projection with pure transformations
const userListProjection = projection<UserEvent, UserListProjection>({
  streamId: 'all-users',

  initialState: { users: [] },

  applyEvent: (state, event, streamId) => {
    // Note: streamId tells us which user aggregate this event belongs to
    switch (event.type) {
      case 'UserRegistered':
        return {
          users: pipe(
            state.users,
            ReadonlyArray.append({
              userId: streamId, // Use the stream ID as the user ID
              email: event.email,
            })
          ),
        };
      case 'UserProfileUpdated':
        return {
          users: pipe(
            state.users,
            ReadonlyArray.map((u) => (u.userId === streamId ? { ...u, name: event.name } : u))
          ),
        };
      default:
        return state;
    }
  },
});

// Use projection
const program = pipe(
  userListProjection.load(),
  Effect.tap((projection) =>
    Effect.sync(() => console.log('Current users:', projection.data.users))
  )
);
```

### 5. Real-time Event Streaming with WebSockets

```typescript
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { makeMessageId } from '@codeforbreakfast/eventsourcing-transport';
import { Stream, Effect, pipe } from 'effect';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Connect to WebSocket server
    const transport = yield* WebSocketConnector.connect('ws://localhost:8080');

    // Subscribe to events
    const subscription = yield* transport.subscribe();

    // Handle incoming messages
    yield* pipe(
      subscription,
      Stream.runForEach((message) => Effect.sync(() => console.log('Received event:', message))),
      Effect.fork
    );

    // Publish an event
    yield* transport.publish({
      id: makeMessageId('event-1'),
      type: 'user.registered',
      payload: { userId: '123', email: 'test@example.com' },
    });
  })
);

// Run with automatic cleanup
await Effect.runPromise(program);
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
const snapshot = pipe(
  Effect.all({
    state: aggregateRoot.getState(),
    version: aggregateRoot.getVersion(),
  }),
  Effect.flatMap(({ state, version }) =>
    version % 10 === 0
      ? // Every 10 events, save snapshot
        SnapshotStore.save({
          aggregateId: state.userId,
          version,
          state,
        })
      : Effect.unit
  )
);
```

## Testing

```typescript
import { TestClock, Effect, pipe, Layer, Stream } from 'effect';
import {
  EventStoreService,
  makeInMemoryEventStore,
  toStreamId,
  beginning,
} from '@codeforbreakfast/eventsourcing-store';

describe('UserAggregate', () => {
  it('should register user', async () => {
    const userId = 'user-123';

    const program = pipe(
      UserAggregate.load(userId),
      Effect.flatMap((loaded) =>
        pipe(
          // Execute command to get events (no userId in command)
          UserAggregate.commands.register('test@example.com')(loaded.data),
          // Commit the events with the aggregate ID
          Effect.flatMap((events) =>
            UserAggregate.commit({
              id: userId,
              eventNumber: loaded.nextEventNumber,
              events,
            })
          ),
          // Read back from event store to verify
          Effect.flatMap(() =>
            pipe(
              EventStoreService,
              Effect.flatMap((eventStore) =>
                pipe(
                  toStreamId(userId),
                  Effect.flatMap(beginning),
                  Effect.flatMap(eventStore.read),
                  Effect.flatMap(Stream.runCollect)
                )
              )
            )
          ),
          // Assert on the stored events
          Effect.tap((storedEvents) =>
            Effect.sync(() => {
              expect(storedEvents).toHaveLength(1);
              expect(storedEvents[0].type).toBe('UserRegistered');
            })
          )
        )
      )
    );

    await Effect.runPromise(
      pipe(program, Effect.provide(Layer.merge(makeInMemoryEventStore(), TestClock.layer)))
    );
  });
});
```

## Error Handling

All operations return Effect types with typed errors using Data.TaggedError:

```typescript
import { Effect, pipe } from 'effect';
import { EventStore, EventStoreError } from '@codeforbreakfast/eventsourcing-store';

const program = pipe(
  EventStore.read({ streamId: 'user-123' }),
  Effect.catchTag('EventStoreError', (error) =>
    pipe(
      Effect.log(`Failed to read events: ${error.message}`),
      Effect.as([]) // Return empty array as fallback
    )
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
register: (email) => (state) =>
  pipe(
    UserRegistered.make({
      type: "UserRegistered",
      email,
      registeredAt: new Date(),
    }),
    Chunk.of,
    Effect.succeed
  )
```

## License

MIT
