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
import { Effect, Layer, Redacted, Schema, Stream, pipe } from 'effect';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  PgConfiguration,
} from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const UserRegistered = Schema.Struct({
  type: Schema.Literal('UserRegistered'),
  userId: Schema.String,
  email: Schema.String,
  timestamp: Schema.String,
});

const UserEmailUpdated = Schema.Struct({
  type: Schema.Literal('UserEmailUpdated'),
  userId: Schema.String,
  oldEmail: Schema.String,
  newEmail: Schema.String,
  timestamp: Schema.String,
});

const UserEvent = Schema.Union(UserRegistered, UserEmailUpdated);
type UserEvent = typeof UserEvent.Type;

const PgConfigLive = Layer.succeed(PgConfiguration, {
  host: 'localhost',
  port: 5432,
  database: 'eventstore',
  username: 'postgres',
  password: Redacted.make('password'),
});

const createTypedEventStore = (stringEventStore: EventStore<string>) =>
  encodedEventStore(Schema.parseJson(UserEvent))(stringEventStore);

const writeAndReadEvents = (eventStore: EventStore<UserEvent>) =>
  pipe(
    toStreamId('user-123'),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((position) =>
          pipe(
            Stream.make({
              type: 'UserRegistered' as const,
              userId: 'user-123',
              email: 'user@example.com',
              timestamp: new Date().toISOString(),
            }),
            Stream.run(eventStore.append(position)),
            Effect.tap((newPosition) =>
              Effect.logInfo(`Events written at position: ${JSON.stringify(newPosition)}`)
            ),
            Effect.flatMap(() => eventStore.read(position)),
            Effect.flatMap(Stream.runCollect),
            Effect.tap((allEvents) =>
              Effect.logInfo(`Retrieved events: ${JSON.stringify(allEvents)}`)
            )
          )
        )
      )
    )
  );

const program = pipe(
  sqlEventStore,
  Effect.map(createTypedEventStore),
  Effect.flatMap(writeAndReadEvents)
);

const AppLayer = pipe(
  Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive),
  Layer.provide(PostgresLive),
  Layer.provide(PgConfigLive)
);

const runProgram = pipe(program, Effect.provide(AppLayer));
```

## Database Setup

### Automatic Migrations

The package includes automatic database schema management:

```typescript
import { Effect, pipe } from 'effect';

declare const runMigrations: (config: {
  readonly migrationsTable: string;
  readonly schemaName: string;
}) => Effect.Effect<void>;

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
import { Layer, Redacted, pipe } from 'effect';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  PgConfiguration,
} from '@codeforbreakfast/eventsourcing-store-postgres';

interface UserEvent {
  readonly type: string;
}

const PgConfigLive = Layer.succeed(PgConfiguration, {
  host: 'localhost',
  port: 5432,
  database: 'eventstore',
  username: 'postgres',
  password: Redacted.make('password'),
});

const EventStoreLive = pipe(
  Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive),
  Layer.provide(PostgresLive),
  Layer.provide(PgConfigLive)
);
```

### Event Streaming with Notifications

Enable real-time event streaming using PostgreSQL LISTEN/NOTIFY:

```typescript
import { Effect, Schema, Stream, pipe } from 'effect';
import { sqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

interface ProcessedEvent {
  readonly type: string;
  readonly data: string;
}

const MyEvent = Schema.Struct({
  type: Schema.String,
  data: Schema.String,
});
type MyEvent = typeof MyEvent.Type;

declare const processEvent: (event: MyEvent) => Effect.Effect<void>;

const subscribeAndProcessEvents = (eventStore: EventStore<MyEvent>) =>
  pipe(
    toStreamId('my-stream'),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((position) => eventStore.subscribe(position)),
        Effect.flatMap((eventStream) =>
          pipe(
            eventStream,
            Stream.runForEach((event) =>
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

const program = pipe(
  sqlEventStore,
  Effect.map(encodedEventStore(Schema.parseJson(MyEvent))),
  Effect.flatMap(subscribeAndProcessEvents)
);
```

### Event Stream Tracking

Track stream positions for reliable event processing:

```typescript
import { Effect, Option, Schema, Stream, pipe } from 'effect';
import { sqlEventStore, EventStreamTracker } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  type EventStreamPosition,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

interface TrackedEvent {
  readonly type: string;
  readonly position: EventStreamPosition;
}

const MyEvent = Schema.Struct({
  type: Schema.String,
  data: Schema.String,
});
type MyEvent = typeof MyEvent.Type;

declare const processEvent: (event: MyEvent) => Effect.Effect<void>;

const processEventsWithTracking = (
  eventStore: EventStore<MyEvent>,
  tracker: {
    readonly processEvent: <T>(
      position: EventStreamPosition,
      event: T
    ) => Effect.Effect<Option.Option<T>>;
  }
) =>
  pipe(
    toStreamId('user-events'),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((startPosition) => eventStore.subscribe(startPosition)),
        Effect.flatMap((eventStream) =>
          pipe(
            eventStream,
            Stream.mapEffect((event) => processEvent(event)),
            Stream.runDrain
          )
        )
      )
    )
  );

const program = pipe(
  Effect.all({
    eventStore: pipe(sqlEventStore, Effect.map(encodedEventStore(Schema.parseJson(MyEvent)))),
    tracker: EventStreamTracker,
  }),
  Effect.flatMap(({ eventStore, tracker }) => processEventsWithTracking(eventStore, tracker))
);
```

## Performance Optimization

### Batch Operations

Efficiently process multiple events:

```typescript
import { Effect, Schema, Stream, pipe } from 'effect';
import { sqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  currentEnd,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const UserEvent = Schema.Struct({
  type: Schema.String,
  userId: Schema.String,
});
type UserEvent = typeof UserEvent.Type;

const appendEventsToStream = (
  eventStore: EventStore<UserEvent>,
  streamId: string,
  events: readonly UserEvent[]
) =>
  pipe(
    toStreamId(streamId),
    Effect.flatMap((stream) =>
      pipe(
        currentEnd(eventStore)(stream),
        Effect.flatMap((position) =>
          pipe(Stream.fromIterable(events), Stream.run(eventStore.append(position)))
        )
      )
    )
  );

const batchAppendEvents = (
  eventStore: EventStore<UserEvent>,
  batches: ReadonlyArray<{ readonly streamId: string; readonly events: readonly UserEvent[] }>
) =>
  pipe(
    batches.map((batch) => appendEventsToStream(eventStore, batch.streamId, batch.events)),
    (effects) => Effect.all(effects, { concurrency: 10 })
  );

const program = pipe(
  sqlEventStore,
  Effect.map(encodedEventStore(Schema.parseJson(UserEvent))),
  Effect.flatMap((eventStore) =>
    batchAppendEvents(eventStore, [
      {
        streamId: 'stream-1',
        events: [{ type: 'test', userId: 'user-1' }],
      },
    ])
  )
);
```

### Stream Projection with Checkpoints

```typescript
import { Chunk, Effect, Option, Schema, Stream, pipe } from 'effect';
import { sqlEventStore, EventStreamTracker } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  type EventStreamPosition,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const MyEvent = Schema.Struct({
  type: Schema.String,
  data: Schema.String,
});
type MyEvent = typeof MyEvent.Type;

declare const updateProjection: (event: MyEvent) => Effect.Effect<void>;

const updateProjectionForChunk = (chunk: Chunk.Chunk<MyEvent>) =>
  pipe(
    chunk,
    Chunk.map(updateProjection),
    (effects) => Effect.all(effects, { concurrency: 'unbounded' }),
    Effect.asVoid
  );

const buildProjectionWithCheckpoints = (
  eventStore: EventStore<MyEvent>,
  tracker: {
    readonly processEvent: <T>(
      position: EventStreamPosition,
      event: T
    ) => Effect.Effect<Option.Option<T>>;
  }
) =>
  pipe(
    toStreamId('user-events'),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((startPos) => eventStore.subscribe(startPos)),
        Effect.flatMap((eventStream) =>
          pipe(
            eventStream,
            Stream.chunks,
            Stream.mapEffect((chunk) => updateProjectionForChunk(chunk)),
            Stream.runDrain
          )
        )
      )
    )
  );

const program = pipe(
  Effect.all({
    eventStore: pipe(sqlEventStore, Effect.map(encodedEventStore(Schema.parseJson(MyEvent)))),
    tracker: EventStreamTracker,
  }),
  Effect.flatMap(({ eventStore, tracker }) => buildProjectionWithCheckpoints(eventStore, tracker))
);
```

## Error Handling and Resilience

### Retry Policies

```typescript
import { Effect, Layer, Schedule, Schema, Sink, Stream, pipe } from 'effect';
import { sqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  type EventStreamPosition,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const UserEvent = Schema.Struct({
  type: Schema.String,
});
type UserEvent = typeof UserEvent.Type;

const createRetrySchedule = () =>
  pipe(Schedule.exponential('1 second', 2.0), Schedule.intersect(Schedule.recurs(3)));

const createFixedRetrySchedule = () =>
  pipe(Schedule.fixed('500 millis'), Schedule.compose(Schedule.recurs(2)));

const createResilientRead = (baseStore: EventStore<string>) => (position: EventStreamPosition) =>
  pipe(baseStore.read(position), Effect.retry(createFixedRetrySchedule()));

const createResilientSubscribe =
  (baseStore: EventStore<string>) => (position: EventStreamPosition) =>
    pipe(baseStore.subscribe(position), Effect.retry(createFixedRetrySchedule()));

const createResilientSubscribeAll = (baseStore: EventStore<string>) => () =>
  pipe(baseStore.subscribeAll(), Effect.retry(createFixedRetrySchedule()));

const createResilientEventStore = (baseStore: EventStore<string>): EventStore<string> => ({
  append: baseStore.append,
  read: createResilientRead(baseStore),
  subscribe: createResilientSubscribe(baseStore),
  subscribeAll: createResilientSubscribeAll(baseStore),
});

const program = pipe(sqlEventStore, Effect.map(createResilientEventStore));
```

### Connection Recovery

```typescript
import { Effect, pipe } from 'effect';

interface ConnectionManager {
  readonly healthCheckIntervalMs: number;
  readonly reconnectOnFailure: boolean;
  readonly maxReconnectAttempts: number;
}

declare const createConnectionManager: (config: ConnectionManager) => Effect.Effect<{
  readonly onConnectionLost: (effect: Effect.Effect<void>) => Effect.Effect<void>;
  readonly onConnectionRestored: (effect: Effect.Effect<void>) => Effect.Effect<void>;
}>;

const handleConnectionLost = (manager: {
  readonly onConnectionLost: (effect: Effect.Effect<void>) => Effect.Effect<void>;
}) =>
  manager.onConnectionLost(
    Effect.logWarning('Database connection lost, attempting to reconnect...')
  );

const handleConnectionRestored = (manager: {
  readonly onConnectionRestored: (effect: Effect.Effect<void>) => Effect.Effect<void>;
}) => manager.onConnectionRestored(Effect.logInfo('Database connection restored'));

const connectionRecovery = pipe(
  createConnectionManager({
    healthCheckIntervalMs: 10000,
    reconnectOnFailure: true,
    maxReconnectAttempts: 5,
  }),
  Effect.flatMap((manager) =>
    pipe(
      handleConnectionLost(manager),
      Effect.flatMap(() => handleConnectionRestored(manager))
    )
  )
);
```

## Monitoring and Observability

### Metrics Collection

```typescript
import { Effect, Metric, Schema, pipe } from 'effect';
import { sqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  type EventStreamPosition,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const UserEvent = Schema.Struct({
  type: Schema.String,
});
type UserEvent = typeof UserEvent.Type;

const eventsWritten = Metric.counter('eventstore_events_written_total');

const recordEventWritten = pipe(Metric.increment(eventsWritten), Effect.asVoid);

const createMetricsWrapper = (baseStore: EventStore<string>) => (position: EventStreamPosition) =>
  baseStore.append(position);

const eventStoreMetrics = pipe(
  sqlEventStore,
  Effect.map((eventStore) => ({
    ...eventStore,
    append: createMetricsWrapper(eventStore),
  }))
);
```

### Health Checks

```typescript
import { Effect, Schema, pipe } from 'effect';
import { sqlEventStore } from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const MyEvent = Schema.Struct({
  type: Schema.String,
});
type MyEvent = typeof MyEvent.Type;

interface HealthStatus {
  readonly status: string;
  readonly timestamp: string;
  readonly error?: string;
}

const createHealthyStatus = (): HealthStatus => ({
  status: 'healthy',
  timestamp: new Date().toISOString(),
});

const createUnhealthyStatus = (error: unknown): HealthStatus => ({
  status: 'unhealthy',
  error: String(error),
  timestamp: new Date().toISOString(),
});

const performHealthCheck = (eventStore: EventStore<MyEvent>) =>
  pipe(
    toStreamId('health-check'),
    Effect.flatMap((testStreamId) =>
      pipe(
        beginning(testStreamId),
        Effect.flatMap((position) => eventStore.read(position)),
        Effect.map(() => createHealthyStatus()),
        Effect.catchAll((error) => Effect.succeed(createUnhealthyStatus(error)))
      )
    )
  );

const healthCheck = pipe(
  sqlEventStore,
  Effect.map(encodedEventStore(Schema.parseJson(MyEvent))),
  Effect.flatMap(performHealthCheck)
);
```

## Testing

### Integration Testing

```typescript
import { Chunk, Effect, Layer, Redacted, Schema, Stream, pipe } from 'effect';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  PgConfiguration,
} from '@codeforbreakfast/eventsourcing-store-postgres';
import {
  type EventStore,
  beginning,
  toStreamId,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';

const UserRegistered = Schema.Struct({
  type: Schema.Literal('UserRegistered'),
  userId: Schema.String,
  email: Schema.String,
  timestamp: Schema.String,
});
type UserRegistered = typeof UserRegistered.Type;

const UserEvent = UserRegistered;
type UserEvent = UserRegistered;

interface TestContainer {
  getHost: () => string;
  getMappedPort: (port: number) => number;
  stop: () => Promise<void>;
}

declare const TestContainer: {
  new (image: string): {
    withEnvironment: (env: Record<string, string>) => {
      withExposedPorts: (port: number) => {
        start: () => Promise<TestContainer>;
      };
    };
  };
};

const createTestDatabase = pipe(
  Effect.promise(() =>
    new TestContainer('postgres:15')
      .withEnvironment({ POSTGRES_PASSWORD: 'test' })
      .withExposedPorts(5432)
      .start()
  ),
  Effect.map((container) => ({
    container,
    config: {
      host: container.getHost(),
      port: container.getMappedPort(5432),
      database: 'postgres',
      username: 'postgres',
      password: Redacted.make('test'),
    },
  }))
);

const testStoreAndRetrieveEvents = (eventStore: EventStore<UserEvent>) =>
  pipe(
    toStreamId('test-stream'),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((position) =>
          pipe(
            Stream.make({
              type: 'UserRegistered' as const,
              userId: 'test-user',
              email: 'test@example.com',
              timestamp: new Date().toISOString(),
            }),
            Stream.run(eventStore.append(position)),
            Effect.flatMap(() => eventStore.read(position)),
            Effect.flatMap(Stream.runCollect),
            Effect.tap((retrievedEvents) =>
              Effect.sync(() => {
                if (Chunk.size(retrievedEvents) !== 1) {
                  throw new Error('Expected 1 event');
                }
                const firstEvent = Chunk.unsafeGet(retrievedEvents, 0);
                if (firstEvent.type !== 'UserRegistered') {
                  throw new Error('Expected UserRegistered event');
                }
              })
            )
          )
        )
      )
    )
  );

const runTest = pipe(
  createTestDatabase,
  Effect.flatMap(({ config, container }) =>
    pipe(
      sqlEventStore,
      Effect.map(encodedEventStore(Schema.parseJson(UserEvent))),
      Effect.flatMap(testStoreAndRetrieveEvents),
      Effect.provide(
        pipe(
          Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive),
          Layer.provide(PostgresLive),
          Layer.provide(Layer.succeed(PgConfiguration, config))
        )
      ),
      Effect.ensuring(Effect.promise(() => container.stop()))
    )
  )
);
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
import { Config, Effect, Layer, Redacted, pipe } from 'effect';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  PgConfiguration,
} from '@codeforbreakfast/eventsourcing-store-postgres';
import { type EventStore, encodedEventStore } from '@codeforbreakfast/eventsourcing-store';

interface YourEvent {
  readonly type: string;
}

const DatabaseConfig = Config.all({
  host: pipe(Config.string('DB_HOST'), Config.withDefault('localhost')),
  port: pipe(Config.integer('DB_PORT'), Config.withDefault(5432)),
  database: pipe(Config.string('DB_NAME'), Config.withDefault('eventstore')),
  username: pipe(Config.string('DB_USER'), Config.withDefault('postgres')),
  password: Config.secret('DB_PASSWORD'),
  maxConnections: pipe(Config.integer('DB_MAX_CONNECTIONS'), Config.withDefault(20)),
  ssl: pipe(Config.boolean('DB_SSL'), Config.withDefault(false)),
});

const createPgConfigLayer = (config: {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: Redacted.Redacted;
  readonly ssl: boolean;
}) =>
  Layer.succeed(PgConfiguration, {
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
  });

const ProductionEventStoreLayer = pipe(
  DatabaseConfig,
  Effect.map(createPgConfigLayer),
  Effect.map((pgConfigLayer) =>
    pipe(
      Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive),
      Layer.provide(PostgresLive),
      Layer.provide(pgConfigLayer)
    )
  ),
  Layer.unwrapEffect
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
