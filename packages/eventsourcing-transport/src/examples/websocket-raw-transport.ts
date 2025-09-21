import { Effect, Stream, Duration, pipe, Schema, Scope } from 'effect';
import {
  ConnectedRawTransport,
  CreateRawTransport,
  SchemaTransportConfig,
  RawWireMessage,
  makeSchemaTransport,
  Codecs,
} from '../schema-transport.js';
import { TransportHealth } from '../types.js';
import {
  TransportConnectionError,
  TransportPublishError,
  TransportSubscriptionError,
} from '../errors.js';

/**
 * Example implementation of a connection-gated WebSocket raw transport.
 * Demonstrates how to implement the raw transport interface with proper
 * connection lifecycle management using Effect.acquireRelease.
 */

interface WebSocketConnection {
  readonly socket: WebSocket;
  readonly messageHandlers: Map<string, Set<(message: RawWireMessage<string>) => void>>;
  readonly metrics: {
    messagesPublished: number;
    messagesReceived: number;
    activeSubscriptions: number;
    connectionAttempts: number;
    errors: number;
  };
  readonly connectedAt: Date;
}

const createWebSocketRawTransport: CreateRawTransport<never> = <TWireFormat>(
  config: SchemaTransportConfig<any, TWireFormat>
) =>
  pipe(
    Effect.acquireRelease(
      // Acquire: Establish WebSocket connection
      Effect.async<WebSocketConnection, TransportConnectionError>((resume) => {
        const socket = new WebSocket(config.url);
        let isConnected = false;

        const connection: WebSocketConnection = {
          socket,
          messageHandlers: new Map(),
          metrics: {
            messagesPublished: 0,
            messagesReceived: 0,
            activeSubscriptions: 0,
            connectionAttempts: 1,
            errors: 0,
          },
          connectedAt: new Date(),
        };

        socket.onopen = () => {
          if (!isConnected) {
            isConnected = true;
            resume(Effect.succeed(connection));
          }
        };

        socket.onerror = (error) => {
          if (!isConnected) {
            isConnected = true;
            resume(
              Effect.fail(
                new TransportConnectionError({
                  message: `WebSocket connection failed: ${error}`,
                  retryable: true,
                })
              )
            );
          }
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const { streamId, wireData, position, timestamp, metadata } = data;

            const message: RawWireMessage<string> = {
              streamId,
              wireData,
              position,
              timestamp: new Date(timestamp),
              metadata,
            };

            const handlers = connection.messageHandlers.get(streamId) ?? new Set();
            handlers.forEach((handler) => handler(message));

            connection.metrics.messagesReceived++;
          } catch (error) {
            connection.metrics.errors++;
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        // Timeout handling
        const timeoutId = setTimeout(() => {
          if (!isConnected) {
            isConnected = true;
            socket.close();
            resume(
              Effect.fail(
                new TransportConnectionError({
                  message: 'WebSocket connection timeout',
                  retryable: true,
                })
              )
            );
          }
        }, Duration.toMillis(config.timeout));

        return Effect.sync(() => {
          clearTimeout(timeoutId);
          if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        });
      }),
      // Release: Clean up WebSocket connection
      (connection) =>
        Effect.sync(() => {
          connection.messageHandlers.clear();
          if (connection.socket.readyState === WebSocket.OPEN) {
            connection.socket.close();
          }
        })
    ),
    Effect.map(
      (connection) =>
        createConnectedRawTransport(connection) as unknown as ConnectedRawTransport<
          TWireFormat,
          never
        >
    )
  ) as Effect.Effect<
    ConnectedRawTransport<TWireFormat, never>,
    TransportConnectionError,
    Scope.Scope
  >;

const createConnectedRawTransport = (
  connection: WebSocketConnection
): ConnectedRawTransport<string, never> => ({
  publishRaw: (streamId, wireData, metadata) =>
    Effect.try({
      try: () => {
        if (connection.socket.readyState !== WebSocket.OPEN) {
          throw new TransportPublishError({
            message: 'WebSocket not connected',
            streamId,
          });
        }

        const message = {
          streamId,
          wireData,
          position: Date.now(), // Simple position based on timestamp
          timestamp: new Date().toISOString(),
          metadata,
        };

        connection.socket.send(JSON.stringify(message));
        connection.metrics.messagesPublished++;
      },
      catch: (error) =>
        new TransportPublishError({
          message: `Failed to publish: ${error}`,
          streamId,
        }),
    }),

  subscribeRaw: (streamId, options) =>
    Stream.asyncEffect<RawWireMessage<string>, TransportSubscriptionError>((emit) =>
      Effect.try({
        try: () => {
          if (connection.socket.readyState !== WebSocket.OPEN) {
            throw new TransportSubscriptionError({
              message: 'WebSocket not connected',
              streamId,
            });
          }

          const handler = (message: RawWireMessage<string>) => emit.single(message);

          const handlers = connection.messageHandlers.get(streamId) ?? new Set();
          handlers.add(handler);
          connection.messageHandlers.set(streamId, handlers);
          connection.metrics.activeSubscriptions++;

          // Send subscription request to server
          connection.socket.send(
            JSON.stringify({
              type: 'subscribe',
              streamId,
              options,
            })
          );

          // Return cleanup effect
          return Effect.sync(() => {
            // Cleanup function
            const currentHandlers = connection.messageHandlers.get(streamId);
            if (currentHandlers) {
              currentHandlers.delete(handler);
              if (currentHandlers.size === 0) {
                connection.messageHandlers.delete(streamId);
                // Send unsubscribe request to server
                if (connection.socket.readyState === WebSocket.OPEN) {
                  connection.socket.send(
                    JSON.stringify({
                      type: 'unsubscribe',
                      streamId,
                    })
                  );
                }
              } else {
                connection.messageHandlers.set(streamId, currentHandlers);
              }
            }
            connection.metrics.activeSubscriptions = Math.max(
              0,
              connection.metrics.activeSubscriptions - 1
            );
          });
        },
        catch: (error) =>
          new TransportSubscriptionError({
            message: `Failed to subscribe: ${error}`,
            streamId,
          }),
      })
    ),

  subscribeMultipleRaw: (streamIds, options) =>
    pipe(
      streamIds,
      Stream.fromIterable,
      Stream.flatMap((streamId) =>
        createConnectedRawTransport(connection).subscribeRaw(streamId, options)
      )
    ),

  health: Effect.succeed({
    connected: connection.socket.readyState === WebSocket.OPEN,
    lastHeartbeat: connection.connectedAt,
    errorCount: connection.metrics.errors,
    uptime: Date.now() - connection.connectedAt.getTime(),
  } satisfies TransportHealth),

  metrics: Effect.succeed(connection.metrics),
});

/**
 * Example usage with schema transport built on top of the raw WebSocket transport
 */
export const exampleSchemaUsage = pipe(
  Effect.gen(function* (_) {
    // Define a message schema
    const messageSchema = Schema.Struct({
      type: Schema.String,
      payload: Schema.Unknown,
      userId: Schema.optional(Schema.String),
    });

    type MessageType = Schema.Schema.Type<typeof messageSchema>;

    // Create schema transport with raw transport baked in
    const createSchemaTransport = makeSchemaTransport<MessageType>(createWebSocketRawTransport);

    const config: SchemaTransportConfig<MessageType, string> = {
      url: 'ws://localhost:8080/events',
      retryAttempts: 3,
      timeout: Duration.seconds(10),
      codec: Codecs.json(messageSchema),
    };

    // Config is now provided at creation time, not connection time
    const connectedTransport = yield* _(createSchemaTransport(config));

    // Use the transport - it's already connected
    yield* _(
      connectedTransport.publish('user-events', {
        type: 'user-login',
        payload: { sessionId: 'abc123' },
        userId: 'user-456',
      })
    );

    const health = yield* _(connectedTransport.health);

    return {
      published: true,
      connected: health.connected,
      uptime: health.uptime,
    };
  }),
  Effect.scoped // Connection cleanup happens automatically
);

export { createWebSocketRawTransport };
