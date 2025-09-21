# @codeforbreakfast/eventsourcing-store-postgres

Production-ready PostgreSQL implementation for event sourcing with Effect integration. This package provides a robust, scalable event store implementation using PostgreSQL with advanced features like optimistic concurrency control, event streaming, and real-time notifications.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-store-postgres effect @effect/platform @effect/sql @effect/sql-pg
```

```bash
bun add @codeforbreakfast/eventsourcing-store-postgres effect @effect/platform @effect/sql @effect/sql-pg
```

## Key Features

- **PostgreSQL Backend**: Production-ready event store using PostgreSQL
- **Effect Integration**: Built on Effect with full functional programming support
- **ACID Transactions**: Guaranteed consistency with PostgreSQL transactions
- **Optimistic Concurrency**: Prevent race conditions with event number tracking
- **Real-time Notifications**: PostgreSQL LISTEN/NOTIFY for immediate event streaming
- **Connection Pooling**: Efficient database connection management
- **Schema Migrations**: Automated database schema setup and versioning
- **Performance Optimized**: Indexed queries and streaming support for large datasets

## Quick Start

```typescript
import { Effect, Layer, Stream, pipe } from 'effect';
import {
  postgresEventStore,
  createConnectionManager,
  runMigrations,
} from '@codeforbreakfast/eventsourcing-store-postgres';
import { PgClient } from '@effect/sql-pg';

// Define your events
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

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'eventstore',
  username: 'postgres',
  password: 'password',
};

// Create PostgreSQL layer
const PostgresLive = PgClient.layer(dbConfig);

// Create event store layer
const EventStoreLive = Layer.provide(postgresEventStore<UserEvent>(), PostgresLive);

// Example usage
const program = pipe(
  Effect.all({
    eventStore: EventStore,
    _: runMigrations(),
  }),
  Effect.flatMap(({ eventStore }) =>
    pipe(
      toStreamId('user-123'),
      Effect.flatMap((streamId) =>
        pipe(
          beginning(streamId),
          Effect.flatMap((position) => {
            const events: UserEvent[] = [
              {
                type: 'UserRegistered',
                userId: 'user-123',
                email: 'user@example.com',
                timestamp: new Date().toISOString(),
              },
            ];

            return pipe(
              Stream.fromIterable(events),
              Stream.run(eventStore.append(position)),
              Effect.tap((newPosition) =>
                Effect.logInfo(`Events written at position: ${JSON.stringify(newPosition)}`)
              ),
              Effect.flatMap(() => eventStore.read(position)),
              Effect.flatMap(Stream.runCollect),
              Effect.tap((allEvents) =>
                Effect.logInfo(`Retrieved events: ${JSON.stringify(allEvents)}`)
              )
            );
          })
        )
      )
    )
  )
);

// Run the program
pipe(program, Effect.provide(EventStoreLive), Effect.runPromise);
```

## Database Setup

### Automatic Migrations

The package includes automatic database schema management:

```typescript
import { runMigrations, MigrationConfig } from '@codeforbreakfast/eventsourcing-store-postgres';

const setupDatabase = pipe(
  runMigrations({
    migrationsTable: 'schema_migrations',
    schemaName: 'eventstore',
  }),
  Effect.tap(() => Effect.logInfo('Database schema is up to date'))
);
```

### Manual Schema Setup

If you prefer manual control, here's the core schema:

```sql
-- Events table
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    stream_id VARCHAR(255) NOT NULL,
    event_number INTEGER NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    event_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(stream_id, event_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_stream_id ON events(stream_id);
CREATE INDEX IF NOT EXISTS idx_events_stream_id_event_number ON events(stream_id, event_number);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);

-- Snapshots table (optional, for performance)
CREATE TABLE IF NOT EXISTS snapshots (
    stream_id VARCHAR(255) PRIMARY KEY,
    event_number INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Advanced Configuration

### Connection Management

```typescript
import { createConnectionManager } from '@codeforbreakfast/eventsourcing-store-postgres';

const connectionManagerLayer = createConnectionManager({
  // Connection pool settings
  maxConnections: 20,
  connectionTimeoutMs: 5000,
  idleTimeoutMs: 30000,

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,

  // Health check settings
  healthCheckIntervalMs: 30000,
});

const EventStoreLive = Layer.provide(
  postgresEventStore<UserEvent>(),
  Layer.merge(PostgresLive, connectionManagerLayer)
);
```

### Event Streaming with Notifications

Enable real-time event streaming using PostgreSQL LISTEN/NOTIFY:

```typescript
import {
  createNotificationListener,
  createSubscriptionManager,
} from '@codeforbreakfast/eventsourcing-store-postgres';

const realTimeEventProcessing = pipe(
  createSubscriptionManager(),
  Effect.flatMap((subscriptionManager) =>
    pipe(
      subscriptionManager.subscribe({
        streamPattern: '*', // All streams
        fromPosition: 'live', // Only new events
      }),
      Effect.flatMap((eventStream) =>
        pipe(
          eventStream,
          Stream.runForeach((event) =>
            pipe(
              Effect.logInfo(`New event received: ${JSON.stringify(event)}`),
              Effect.flatMap(() => processEvent(event))
            )
          )
        )
      )
    )
  )
);
```

### Event Stream Tracking

Track stream positions for reliable event processing:

```typescript
import { createEventStreamTracker } from '@codeforbreakfast/eventsourcing-store-postgres';

const reliableEventProcessing = pipe(
  createEventStreamTracker({
    processorName: 'user-projection-processor',
    checkpointIntervalMs: 5000,
  }),
  Effect.flatMap((tracker) =>
    pipe(
      Effect.all({
        lastPosition: tracker.getLastProcessedPosition(),
        streamId: toStreamId('user-events'),
        eventStore: EventStore,
      }),
      Effect.flatMap(({ lastPosition, streamId, eventStore }) =>
        pipe(
          lastPosition ? Effect.succeed(lastPosition) : beginning(streamId),
          Effect.flatMap((startPosition) => eventStore.subscribe(startPosition)),
          Effect.flatMap((eventStream) =>
            pipe(
              eventStream,
              Stream.mapEffect((event) =>
                pipe(
                  processEvent(event),
                  Effect.flatMap(() => tracker.updatePosition(event.position))
                )
              ),
              Stream.runDrain
            )
          )
        )
      )
    )
  )
);
```

## Performance Optimization

### Batch Operations

Efficiently process multiple events:

```typescript
const batchAppendEvents = (events: Array<{ streamId: string; events: UserEvent[] }>) =>
  pipe(
    EventStore,
    Effect.flatMap((eventStore) =>
      Effect.all(
        events.map(({ streamId, events: streamEvents }) =>
          pipe(
            toStreamId(streamId),
            Effect.flatMap((stream) =>
              pipe(
                currentEnd(eventStore)(stream),
                Effect.flatMap((position) =>
                  pipe(Stream.fromIterable(streamEvents), Stream.run(eventStore.append(position)))
                )
              )
            )
          )
        ),
        { concurrency: 10 }
      )
    )
  );
```

### Stream Projection with Checkpoints

```typescript
const buildProjectionWithCheckpoints = pipe(
  Effect.all({
    tracker: createEventStreamTracker({
      processorName: 'user-profile-projection',
    }),
    streamId: toStreamId('user-events'),
    eventStore: EventStore,
  }),
  Effect.flatMap(({ tracker, streamId, eventStore }) =>
    pipe(
      tracker.getLastProcessedPosition(),
      Effect.flatMap((lastPosition) =>
        pipe(
          lastPosition ? Effect.succeed(lastPosition) : beginning(streamId),
          Effect.flatMap((startPos) => eventStore.subscribe(startPos)),
          Effect.flatMap((eventStream) =>
            pipe(
              eventStream,
              Stream.chunks, // Process in chunks for better performance
              Stream.mapEffect((chunk) =>
                pipe(
                  Effect.forEach(chunk, updateProjection),
                  Effect.flatMap(() => {
                    const lastEvent = chunk[chunk.length - 1];
                    return tracker.updatePosition(lastEvent.position);
                  })
                )
              ),
              Stream.runDrain
            )
          )
        )
      )
    )
  )
);
```

## Error Handling and Resilience

### Retry Policies

```typescript
import { Schedule, Sink, Stream } from 'effect';

const resilientEventStore = Layer.effect(
  EventStore,
  pipe(
    postgresEventStore<UserEvent>(),
    Effect.map((baseStore) => ({
      ...baseStore,
      write: (position) =>
        Sink.make((chunks) =>
          pipe(
            Stream.fromIterable(chunks.flatten()),
            Stream.run(baseStore.write(position)),
            Effect.retry(
              pipe(Schedule.exponential('1 second', 2.0), Schedule.intersect(Schedule.recurs(3)))
            )
          )
        ),
      read: (position) =>
        pipe(
          baseStore.read(position),
          Effect.retry(pipe(Schedule.fixed('500 millis'), Schedule.compose(Schedule.recurs(2))))
        ),
      subscribe: (position) =>
        pipe(
          baseStore.subscribe(position),
          Effect.retry(pipe(Schedule.fixed('500 millis'), Schedule.compose(Schedule.recurs(2))))
        ),
    }))
  )
);
```

### Connection Recovery

```typescript
const connectionRecovery = pipe(
  createConnectionManager({
    healthCheckIntervalMs: 10000,
    reconnectOnFailure: true,
    maxReconnectAttempts: 5,
  }),
  Effect.tap((connectionManager) =>
    pipe(
      connectionManager.onConnectionLost(
        Effect.logWarning('Database connection lost, attempting to reconnect...')
      ),
      Effect.flatMap(() =>
        connectionManager.onConnectionRestored(Effect.logInfo('Database connection restored'))
      )
    )
  )
);
```

## Monitoring and Observability

### Metrics Collection

```typescript
import { Metrics } from 'effect';

const eventStoreMetrics = pipe(
  EventStore,
  Effect.map((eventStore) => {
    // Track event write latency
    const appendLatency = Metrics.histogram('eventstore_append_latency_ms');

    // Track events written
    const eventsWritten = Metrics.counter('eventstore_events_written_total');

    return {
      ...eventStore,
      append: (position, events) =>
        pipe(
          eventStore.append(position, events),
          Effect.timed,
          Effect.flatMap(([duration, result]) =>
            pipe(
              writeLatency(duration.millis),
              Effect.flatMap(() => eventsWritten(events.length)),
              Effect.map(() => result)
            )
          )
        ),
    };
  })
);
```

### Health Checks

```typescript
const healthCheck = pipe(
  Effect.all({
    eventStore: EventStore,
    testStreamId: toStreamId('health-check'),
  }),
  Effect.flatMap(({ eventStore, testStreamId }) =>
    pipe(
      beginning(testStreamId),
      Effect.flatMap((position) => eventStore.read(position)),
      Effect.map(() => ({ status: 'healthy', timestamp: new Date().toISOString() })),
      Effect.catchAll((error) =>
        Effect.succeed({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      )
    )
  )
);
```

## Testing

### Integration Testing

```typescript
import { TestContainer } from 'testcontainers';

const createTestDatabase = pipe(
  Effect.promise(() =>
    new TestContainer('postgres:15')
      .withEnvironment({ POSTGRES_PASSWORD: 'test' })
      .withExposedPorts(5432)
      .start()
  ),
  Effect.map((container) => ({
    container,
    dbConfig: {
      host: container.getHost(),
      port: container.getMappedPort(5432),
      database: 'postgres',
      username: 'postgres',
      password: 'test',
    },
  }))
);

describe('PostgreSQL Event Store', () => {
  test('should store and retrieve events', () => {
    const program = pipe(
      createTestDatabase,
      Effect.flatMap(({ dbConfig }) =>
        pipe(
          Layer.provide(postgresEventStore<UserEvent>(), PgClient.layer(dbConfig)),
          Layer.build,
          Effect.flatMap((context) =>
            pipe(
              runMigrations(),
              Effect.flatMap(
                () =>
                  pipe(
                    Effect.all({
                      eventStore: EventStore,
                      streamId: toStreamId('test-stream'),
                    }),
                    Effect.flatMap(({ eventStore, streamId }) =>
                      pipe(
                        beginning(streamId),
                        Effect.flatMap((position) => {
                          const events: UserEvent[] = [
                            {
                              type: 'UserRegistered',
                              userId: 'test-user',
                              email: 'test@example.com',
                              timestamp: new Date().toISOString(),
                            },
                          ];

                          return pipe(
                            Stream.fromIterable(events),
                            Stream.run(eventStore.append(position)),
                            Effect.flatMap(() => eventStore.read(position)),
                            Effect.flatMap(Stream.runCollect),
                            Effect.tap((retrievedEvents) =>
                              Effect.sync(() => {
                                expect(retrievedEvents).toHaveLength(1);
                                expect(retrievedEvents[0].type).toBe('UserRegistered');
                              })
                            )
                          );
                        })
                      )
                    )
                  ),
                Effect.provide(context)
              )
            )
          )
        )
      )
    );

    return Effect.runPromise(program);
  });
});
```

## Production Deployment

### Docker Configuration

```dockerfile
# Dockerfile for PostgreSQL with extensions
FROM postgres:15

# Install required extensions
RUN apt-get update && apt-get install -y postgresql-contrib

# Copy initialization scripts
COPY ./sql/init.sql /docker-entrypoint-initdb.d/

# Set up database
ENV POSTGRES_DB=eventstore
ENV POSTGRES_USER=eventstore
ENV POSTGRES_PASSWORD=your-secure-password
```

### Environment Configuration

```typescript
// config/database.ts
import { Config } from 'effect';

const DatabaseConfig = Config.all({
  host: Config.string('DB_HOST').pipe(Config.withDefault('localhost')),
  port: Config.integer('DB_PORT').pipe(Config.withDefault(5432)),
  database: Config.string('DB_NAME').pipe(Config.withDefault('eventstore')),
  username: Config.string('DB_USER').pipe(Config.withDefault('postgres')),
  password: Config.secret('DB_PASSWORD'),
  maxConnections: Config.integer('DB_MAX_CONNECTIONS').pipe(Config.withDefault(20)),
  ssl: Config.boolean('DB_SSL').pipe(Config.withDefault(false)),
});

const ProductionEventStoreLayer = Layer.effect(
  EventStore,
  Effect.gen(function* () {
    const config = yield* DatabaseConfig;

    const pgLayer = PgClient.layer({
      ...config,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });

    return yield* postgresEventStore<YourEvent>().pipe(Effect.provide(pgLayer));
  })
);
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Core event store interfaces
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Aggregate root patterns
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
