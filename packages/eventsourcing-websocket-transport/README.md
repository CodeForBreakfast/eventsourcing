# @codeforbreakfast/eventsourcing-websocket-transport

WebSocket transport layer for event sourcing with Effect integration. This package provides real-time event streaming, bidirectional communication, and robust WebSocket connection management for event-sourced applications.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-websocket-transport effect
```

```bash
bun add @codeforbreakfast/eventsourcing-websocket-transport effect
```

## Key Features

- **Real-time Event Streaming**: Stream events to clients as they occur
- **Effect Integration**: Functional, composable WebSocket operations
- **Connection Management**: Automatic reconnection, heartbeat, and connection health monitoring
- **Type-safe Messaging**: Strongly-typed message schemas with runtime validation
- **Connection Metrics**: Built-in metrics tracking for connection quality and performance
- **Error Resilience**: Comprehensive error handling and recovery mechanisms
- **Scalable Architecture**: Support for multiple concurrent connections

## Quick Start

### Server-Side Event Broadcasting

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  createWebSocketConnection,
  WebSocketService,
  WebSocketServiceLive,
} from '@codeforbreakfast/eventsourcing-websocket-transport';

// Define your event types
interface UserRegistered {
  type: 'UserRegistered';
  userId: string;
  email: string;
  timestamp: string;
}

interface UserEmailUpdated {
  type: 'UserEmailUpdated';
  userId: string;
  newEmail: string;
  timestamp: string;
}

type UserEvent = UserRegistered | UserEmailUpdated;

// Create WebSocket event broadcaster
const broadcastEvents = (eventStream: Stream.Stream<UserEvent, Error>) =>
  pipe(
    WebSocketService,
    Effect.map((webSocketService) => {
      // Track all connected clients
      const connections = new Set<WebSocketConnection<UserEvent>>();

      // Handle new connections
      const handleConnection = (connection: WebSocketConnection<UserEvent>) =>
        pipe(
          Effect.sync(() => connections.add(connection)),
          Effect.tap(() => Effect.logInfo(`Client connected: ${connection.id}`)),
          Effect.flatMap(() =>
            connection.onClose(() =>
              pipe(
                Effect.sync(() => connections.delete(connection)),
                Effect.tap(() => Effect.logInfo(`Client disconnected: ${connection.id}`))
              )
            )
          )
        );

      return { handleConnection, connections };
    }),
    Effect.flatMap(({ connections }) =>
      pipe(
        eventStream,
        Stream.runForeach((event) =>
          pipe(
            Effect.logInfo(`Broadcasting event: ${event.type}`),
            Effect.flatMap(() =>
              Effect.forEach(Array.from(connections), (connection) => connection.send(event), {
                concurrency: 'unbounded',
              })
            )
          )
        )
      )
    )
  );

// Usage with event store
const program = pipe(
  Effect.all({
    eventStore: EventStore,
    streamId: toStreamId('user-events'),
  }),
  Effect.flatMap(({ eventStore, streamId }) =>
    pipe(
      beginning(streamId),
      Effect.flatMap((position) => eventStore.subscribe(position)),
      Effect.flatMap(broadcastEvents)
    )
  ),
  Effect.provide(WebSocketServiceLive),
  Effect.provide(eventStoreLayer)
);
```

### Client-Side Event Consumption

```typescript
import { Effect, Stream } from 'effect';
import {
  createWebSocketConnection,
  WebSocketConfig,
  ConnectionError,
} from '@codeforbreakfast/eventsourcing-websocket-transport';

// Configure WebSocket client
const clientConfig: WebSocketConfig = {
  url: 'ws://localhost:8080/events',
  reconnectAttempts: 5,
  reconnectDelayMs: 1000,
  heartbeatIntervalMs: 30000,
  connectionTimeoutMs: 10000,
};

// Create client connection
const eventClient = pipe(
  createWebSocketConnection<UserEvent>(clientConfig),
  Effect.tap((connection) =>
    pipe(
      connection.onOpen(() => Effect.logInfo('Connected to event stream')),
      Effect.flatMap(() =>
        connection.onError((error) => Effect.logError(`WebSocket error: ${error.message}`))
      )
    )
  ),
  Effect.flatMap((connection) =>
    pipe(
      connection.messages,
      Stream.runForeach((event) =>
        pipe(
          Effect.logInfo(`Received event: ${event.type}`),
          Effect.flatMap(() => {
            switch (event.type) {
              case 'UserRegistered':
                return handleUserRegistered(event);
              case 'UserEmailUpdated':
                return handleUserEmailUpdated(event);
              default:
                return Effect.void;
            }
          })
        )
      )
    )
  )
);

const handleUserRegistered = (event: UserRegistered) =>
  Effect.logInfo(`New user registered: ${event.email}`);

const handleUserEmailUpdated = (event: UserEmailUpdated) =>
  Effect.logInfo(`User email updated to: ${event.newEmail}`);
```

## Advanced Configuration

### Connection Management

```typescript
import {
  WebSocketServiceLive,
  createMetricsTracker,
  ConnectionMetrics,
} from '@codeforbreakfast/eventsourcing-websocket-transport';

const advancedWebSocketConfig = pipe(
  Effect.all({
    metricsTracker: Effect.succeed(createMetricsTracker()),
    service: WebSocketServiceLive,
  }),
  Effect.map(({ metricsTracker, service }) => ({
    ...service,
    createConnection: (config: WebSocketConfig) =>
      pipe(
        service.createConnection(config),
        Effect.tap((connection) =>
          pipe(
            metricsTracker.trackConnection(connection.id),
            Effect.flatMap(() =>
              connection.onMetricsUpdate((metrics: ConnectionMetrics) =>
                pipe(
                  Effect.logDebug(`Connection metrics: ${formatMetrics(metrics)}`),
                  Effect.flatMap(() =>
                    metrics.connectionQuality === 'poor'
                      ? Effect.logWarning(`Poor connection quality for ${connection.id}`)
                      : Effect.void
                  )
                )
              )
            )
          )
        )
      ),
  }))
);
```

### Message Validation

```typescript
import { Schema, ParseResult } from 'effect';

// Define message schemas
const UserEventSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('UserRegistered'),
    userId: Schema.String,
    email: Schema.String.pipe(Schema.format('email')),
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('UserEmailUpdated'),
    userId: Schema.String,
    newEmail: Schema.String.pipe(Schema.format('email')),
    timestamp: Schema.String,
  })
);

// Validated message handler
const handleValidatedMessage = (rawMessage: unknown) =>
  pipe(
    Schema.decode(UserEventSchema)(rawMessage),
    Effect.flatMap((event) =>
      pipe(
        Effect.logInfo(`Processing validated event: ${event.type}`),
        Effect.flatMap(() => {
          // Safe to use typed event here
          switch (event.type) {
            case 'UserRegistered':
              return processUserRegistration(event);
            case 'UserEmailUpdated':
              return processEmailUpdate(event);
            default:
              return Effect.void;
          }
        })
      )
    ),
    Effect.catchTag('ParseError', (error) =>
      Effect.logError(`Invalid message format: ${error.message}`)
    )
  );
```

### Connection Pool Management

```typescript
interface ConnectionPool<T> {
  readonly getConnection: (
    userId: string
  ) => Effect.Effect<WebSocketConnection<T>, ConnectionError>;
  readonly removeConnection: (userId: string) => Effect.Effect<void>;
  readonly broadcastToAll: (message: T) => Effect.Effect<void>;
  readonly broadcastToUsers: (userIds: string[], message: T) => Effect.Effect<void>;
}

const createConnectionPool = <T>(): Effect.Effect<ConnectionPool<T>> =>
  Effect.sync(() => {
    const connections = new Map<string, WebSocketConnection<T>>();

    return {
      getConnection: (userId: string) =>
        pipe(
          Option.fromNullable(connections.get(userId)),
          Option.match({
            onNone: () =>
              Effect.fail(new ConnectionError({ message: `No connection for user ${userId}` })),
            onSome: (connection) => Effect.succeed(connection),
          })
        ),

      removeConnection: (userId: string) =>
        Effect.sync(() => {
          connections.delete(userId);
        }),

      broadcastToAll: (message: T) =>
        pipe(
          Effect.forEach(
            Array.from(connections.values()),
            (connection) => connection.send(message),
            { concurrency: 'unbounded' }
          ),
          Effect.asVoid
        ),

      broadcastToUsers: (userIds: string[], message: T) =>
        pipe(
          Effect.forEach(
            userIds,
            (userId) =>
              pipe(
                Option.fromNullable(connections.get(userId)),
                Option.match({
                  onNone: () => Effect.logWarning(`No connection for user ${userId}`),
                  onSome: (connection) => connection.send(message),
                })
              ),
            { concurrency: 'unbounded' }
          ),
          Effect.asVoid
        ),
    };
  });
```

## Real-time Event Streaming Patterns

### Event Filtering

```typescript
// Filter events by user or criteria
const createUserSpecificStream = (userId: string, eventStream: Stream.Stream<UserEvent, Error>) =>
  pipe(
    eventStream,
    Stream.filter((event) => {
      switch (event.type) {
        case 'UserRegistered':
        case 'UserEmailUpdated':
          return event.userId === userId;
        default:
          return false;
      }
    })
  );

// Broadcast filtered events
const broadcastUserEvents = (userId: string, connection: WebSocketConnection<UserEvent>) =>
  pipe(
    Effect.all({
      eventStore: EventStore,
      streamId: toStreamId('user-events'),
    }),
    Effect.flatMap(({ eventStore, streamId }) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((position) => eventStore.subscribe(position)),
        Effect.map((eventStream) => createUserSpecificStream(userId, eventStream)),
        Effect.flatMap((userStream) =>
          pipe(
            userStream,
            Stream.runForeach((event) => connection.send(event))
          )
        )
      )
    )
  );
```

### Event Aggregation

```typescript
// Aggregate events over time windows
const createEventSummaryStream = (eventStream: Stream.Stream<UserEvent, Error>) =>
  pipe(
    eventStream,
    Stream.groupedWithin(100, '5 seconds'), // Batch events
    Stream.map((chunk) => ({
      type: 'EventSummary' as const,
      count: chunk.length,
      eventTypes: [...new Set(chunk.map((event) => event.type))],
      timestamp: new Date().toISOString(),
    }))
  );

// Broadcast summaries instead of individual events
const broadcastEventSummaries = (connection: WebSocketConnection<any>) =>
  pipe(
    getEventStream(),
    Effect.map(createEventSummaryStream),
    Effect.flatMap((summaryStream) =>
      pipe(
        summaryStream,
        Stream.runForeach((summary) => connection.send(summary))
      )
    )
  );
```

### Backpressure Handling

```typescript
const resilientEventBroadcast =
  (connections: Set<WebSocketConnection<UserEvent>>) =>
  (eventStream: Stream.Stream<UserEvent, Error>) =>
    pipe(
      eventStream,
      Stream.buffer(1000), // Buffer events to handle bursts
      Stream.mapEffect((event) =>
        pipe(
          Effect.all(
            Array.from(connections).map((connection) =>
              pipe(
                connection.send(event),
                Effect.timeout('1 second'),
                Effect.either // Convert to Either to handle individual failures
              )
            ),
            { concurrency: 50 }
          ),
          Effect.tap((sendResults) => {
            const failures = sendResults.filter(Either.isLeft);
            return failures.length > 0
              ? Effect.logWarning(`Failed to send to ${failures.length} connections`)
              : Effect.void;
          })
        )
      ),
      Stream.runDrain
    );
```

## Error Handling and Recovery

### Connection Recovery

```typescript
const resilientConnection = (config: WebSocketConfig) =>
  pipe(
    createWebSocketConnection<UserEvent>(config),
    Effect.flatMap((initialConnection) => {
      const connectionRef = { current: initialConnection };

      return pipe(
        initialConnection.onError((error) =>
          pipe(
            Effect.logError(`Connection error: ${error.message}`),
            Effect.flatMap(() => Effect.sleep('2 seconds')),
            Effect.flatMap(() => createWebSocketConnection<UserEvent>(config)),
            Effect.tap((newConnection) =>
              Effect.sync(() => {
                connectionRef.current = newConnection;
              })
            ),
            Effect.tap(() => Effect.logInfo('Reconnected successfully')),
            Effect.retry(
              pipe(Schedule.exponential('1 second', 2.0), Schedule.intersect(Schedule.recurs(5)))
            )
          )
        ),
        Effect.map(() => connectionRef.current)
      );
    })
  );
```

### Message Delivery Guarantees

```typescript
interface ReliableMessage<T> {
  readonly id: string;
  readonly payload: T;
  readonly timestamp: string;
  readonly retryCount: number;
}

const createReliableConnection = <T>(config: WebSocketConfig) =>
  pipe(
    createWebSocketConnection<ReliableMessage<T>>(config),
    Effect.map((connection) => {
      const pendingMessages = new Map<string, ReliableMessage<T>>();

      const sendReliable = (payload: T) =>
        pipe(
          Effect.sync(
            () =>
              ({
                id: crypto.randomUUID(),
                payload,
                timestamp: new Date().toISOString(),
                retryCount: 0,
              }) as ReliableMessage<T>
          ),
          Effect.tap((message) => Effect.sync(() => pendingMessages.set(message.id, message))),
          Effect.tap((message) => connection.send(message)),
          Effect.tap((message) =>
            Effect.fork(
              pipe(
                Effect.sleep('5 seconds'),
                Effect.flatMap(() =>
                  pendingMessages.has(message.id)
                    ? pipe(
                        Effect.sync(() => ({
                          ...message,
                          retryCount: message.retryCount + 1,
                        })),
                        Effect.flatMap((updatedMessage) =>
                          updatedMessage.retryCount < 3
                            ? pipe(
                                Effect.sync(() => pendingMessages.set(message.id, updatedMessage)),
                                Effect.flatMap(() => connection.send(updatedMessage))
                              )
                            : pipe(
                                Effect.sync(() => pendingMessages.delete(message.id)),
                                Effect.flatMap(() =>
                                  Effect.logError(`Message ${message.id} failed after 3 retries`)
                                )
                              )
                        )
                      )
                    : Effect.void
                )
              )
            )
          )
        );

      // Handle acknowledgments
      pipe(
        connection.onMessage((message) =>
          message.type === 'ack'
            ? Effect.sync(() => pendingMessages.delete(message.messageId))
            : Effect.void
        ),
        Effect.runPromise
      );

      return { ...connection, sendReliable };
    })
  );
```

## Monitoring and Metrics

### Connection Health Monitoring

```typescript
const monitorConnectionHealth = (connection: WebSocketConnection<any>) =>
  pipe(
    Effect.succeed(createMetricsTracker()),
    Effect.flatMap((metricsTracker) =>
      Effect.repeat(
        pipe(
          metricsTracker.getMetrics(connection.id),
          Effect.tap((metrics) =>
            pipe(
              Effect.logDebug(`Connection ${connection.id} health: ${metrics.connectionHealth}`),
              Effect.flatMap(() =>
                metrics.connectionQuality === 'poor'
                  ? Effect.logWarning(`Poor connection quality detected for ${connection.id}`)
                  : Effect.void
              ),
              Effect.flatMap(() =>
                metrics.averageLatency > 1000
                  ? Effect.logWarning(`High latency detected: ${metrics.averageLatency}ms`)
                  : Effect.void
              )
            )
          )
        ),
        Schedule.fixed('30 seconds')
      )
    )
  );
```

### Performance Metrics

```typescript
const createPerformanceMonitor = () =>
  Effect.sync(() => {
    const metrics = {
      totalConnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      averageLatency: 0,
      errorCount: 0,
    };

    return {
      incrementConnections: () =>
        Effect.sync(() => {
          metrics.totalConnections++;
        }),
      incrementMessagesSent: () =>
        Effect.sync(() => {
          metrics.messagesSent++;
        }),
      incrementMessagesReceived: () =>
        Effect.sync(() => {
          metrics.messagesReceived++;
        }),
      recordLatency: (latency: number) =>
        Effect.sync(() => {
          metrics.averageLatency = (metrics.averageLatency + latency) / 2;
        }),
      incrementErrors: () =>
        Effect.sync(() => {
          metrics.errorCount++;
        }),
      getMetrics: () => Effect.succeed(metrics),
    };
  });
```

## Testing

### WebSocket Testing Utilities

```typescript
import { Effect, TestClock, TestContext } from 'effect';

const createMockWebSocket = <T>() =>
  Effect.sync(() => {
    const messages: T[] = [];
    const connectionState = { isConnected: true };

    const mockConnection: WebSocketConnection<T> = {
      id: 'mock-connection',
      send: (message: T) =>
        Effect.sync(() => {
          messages.push(message);
        }),
      close: () =>
        Effect.sync(() => {
          connectionState.isConnected = false;
        }),
      onOpen: () => Effect.void,
      onClose: () => Effect.void,
      onError: () => Effect.void,
      onMessage: () => Effect.void,
      messages: Stream.fromIterable(messages),
    };

    return { mockConnection, messages, connectionState };
  });

// Test event broadcasting
describe('WebSocket Event Broadcasting', () => {
  test('should broadcast events to all connected clients', () => {
    const program = pipe(
      createMockWebSocket<UserEvent>(),
      Effect.flatMap(({ mockConnection, messages }) => {
        const testEvent: UserEvent = {
          type: 'UserRegistered',
          userId: 'test-user',
          email: 'test@example.com',
          timestamp: new Date().toISOString(),
        };

        return pipe(
          mockConnection.send(testEvent),
          Effect.tap(() =>
            Effect.sync(() => {
              expect(messages).toHaveLength(1);
              expect(messages[0]).toEqual(testEvent);
            })
          )
        );
      })
    );

    return Effect.runPromise(program);
  });
});
```

## Integration Examples

### With Event Store

```typescript
const integrateWithEventStore = pipe(
  Effect.all({
    eventStore: EventStore,
    webSocketService: WebSocketService,
    streamId: toStreamId('all-events'),
  }),
  Effect.flatMap(({ eventStore, webSocketService, streamId }) =>
    pipe(
      beginning(streamId),
      Effect.flatMap((position) => eventStore.subscribe(position)),
      Effect.flatMap((eventStream) => {
        const connections = new Set<WebSocketConnection<UserEvent>>();

        return pipe(
          webSocketService.onConnection((connection) =>
            pipe(
              Effect.sync(() => connections.add(connection)),
              Effect.flatMap(() =>
                connection.onClose(() => Effect.sync(() => connections.delete(connection)))
              )
            )
          ),
          Effect.flatMap(() =>
            pipe(
              eventStream,
              Stream.runForeach((event) =>
                Effect.forEach(Array.from(connections), (connection) => connection.send(event), {
                  concurrency: 'unbounded',
                })
              )
            )
          )
        );
      })
    )
  )
);
```

### With Projections

```typescript
const streamProjectionUpdates = pipe(
  Effect.all({
    projectionStore: ProjectionStore,
    webSocketService: WebSocketService,
  }),
  Effect.flatMap(({ projectionStore, webSocketService }) =>
    pipe(
      projectionStore.watchUpdates(),
      Effect.flatMap((projectionUpdates) =>
        pipe(
          projectionUpdates,
          Stream.runForeach((update) =>
            pipe(
              getConnectionsForProjection(update.projectionId),
              Effect.flatMap((interestedConnections) =>
                Effect.forEach(
                  interestedConnections,
                  (connection) =>
                    connection.send({
                      type: 'ProjectionUpdated',
                      projectionId: update.projectionId,
                      data: update.data,
                      timestamp: new Date().toISOString(),
                    }),
                  { concurrency: 'unbounded' }
                )
              )
            )
          )
        )
      )
    )
  )
);
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Core event store interfaces
- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL implementation
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Write-side aggregate patterns
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
