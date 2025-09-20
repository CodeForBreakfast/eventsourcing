import { Effect, pipe, Stream } from 'effect';
import {
  createWebSocketConnection,
  type DisconnectedWebSocket,
  type ConnectingWebSocket,
  type ConnectedWebSocket,
  ConnectionError,
  SendError,
} from './webSocketConnection';
import { WebSocketUrl, OutgoingMessage } from './types';

/**
 * Example: Basic WebSocket usage with state-based API
 */
export const basicExample = () =>
  pipe(
    // 1. Create a new connection (starts disconnected)
    createWebSocketConnection(),

    // 2. Connect to a WebSocket server
    Effect.flatMap((disconnected) =>
      disconnected.connect('ws://localhost:8080' as WebSocketUrl),
    ),

    // 3. Wait for connection to establish
    Effect.flatMap((connecting) => connecting.wait()),

    // 4. Use the connected socket
    Effect.flatMap((connected) =>
      pipe(
        // Send a message
        connected.send('Hello, server!' as OutgoingMessage),

        // Receive messages (as a stream)
        Effect.flatMap(() =>
          pipe(connected.receive(), Stream.take(5), Stream.runCollect),
        ),

        // Disconnect when done
        Effect.flatMap(() => connected.disconnect()),
      ),
    ),
  );

/**
 * Example: Connection with error handling and retry
 */
export const connectionWithRetry = () => {
  const attemptConnection = (
    socket: DisconnectedWebSocket,
    url: WebSocketUrl,
    maxAttempts = 3,
  ): Effect.Effect<ConnectedWebSocket, ConnectionError> =>
    pipe(
      socket.connect(url),
      Effect.flatMap((connecting) => connecting.wait()),
      Effect.catchAll((error) =>
        maxAttempts > 1
          ? pipe(
              Effect.logError(
                `Connection failed: ${error.reason}. Retrying...`,
              ),
              Effect.delay(1000),
              Effect.flatMap(() =>
                attemptConnection(socket, url, maxAttempts - 1),
              ),
            )
          : Effect.fail(error),
      ),
    );

  return pipe(
    createWebSocketConnection(),
    Effect.flatMap((socket) =>
      attemptConnection(socket, 'ws://localhost:8080' as WebSocketUrl),
    ),
  );
};

/**
 * Example: Concurrent message handling
 */
export const concurrentMessageHandling = () =>
  pipe(
    createWebSocketConnection(),
    Effect.flatMap((socket) =>
      socket.connect('ws://localhost:8080' as WebSocketUrl),
    ),
    Effect.flatMap((connecting) => connecting.wait()),
    Effect.flatMap((connected) => {
      // Process incoming messages concurrently
      const messageProcessor = pipe(
        connected.receive(),
        Stream.mapEffect(
          (message) =>
            pipe(
              Effect.logInfo(`Received: ${message}`),
              Effect.flatMap(() => {
                // Echo back the message
                if (message.startsWith('ECHO:')) {
                  return connected.send(message as OutgoingMessage);
                }
                return Effect.void;
              }),
            ),
          { concurrency: 5 },
        ),
        Stream.runDrain,
      );

      // Send periodic ping messages
      const pingSender = pipe(
        Stream.repeatEffect(
          pipe(connected.send('PING' as OutgoingMessage), Effect.delay(5000)),
        ),
        Stream.take(10),
        Stream.runDrain,
      );

      // Run both concurrently
      return pipe(
        Effect.all([messageProcessor, pingSender], { concurrency: 2 }),
        Effect.race(Effect.sleep(60000)), // Stop after 1 minute
        Effect.flatMap(() => connected.disconnect()),
      );
    }),
  );

/**
 * Example: Connection state monitoring
 */
export const connectionStateMonitoring = () => {
  // Connection state type for monitoring
  // type ConnectionState =
  //   | { _tag: 'disconnected' }
  //   | { _tag: 'connecting'; url: WebSocketUrl }
  //   | { _tag: 'connected'; url: WebSocketUrl; metrics: unknown }
  //   | { _tag: 'error'; reason: string };

  const monitorConnection = (
    socket: DisconnectedWebSocket,
    url: WebSocketUrl,
  ): Effect.Effect<void, ConnectionError> =>
    pipe(
      // Log disconnected state
      Effect.logInfo('State: disconnected'),

      // Attempt connection
      Effect.flatMap(() => socket.connect(url)),
      Effect.tap(() => Effect.logInfo(`State: connecting to ${url}`)),

      // Wait for connection
      Effect.flatMap((connecting) =>
        pipe(
          connecting.wait(),
          Effect.tap(() => Effect.logInfo(`State: connected to ${url}`)),

          // Monitor metrics periodically
          Effect.flatMap((connected) =>
            pipe(
              Stream.repeatEffect(
                pipe(
                  connected.metrics(),
                  Effect.tap((metrics) =>
                    Effect.logInfo(`Metrics: ${JSON.stringify(metrics)}`),
                  ),
                  Effect.delay(10000),
                ),
              ),
              Stream.take(6), // Monitor for 1 minute
              Stream.runDrain,
              Effect.flatMap(() => connected.disconnect()),
            ),
          ),

          // Handle connection errors
          Effect.catchAll((error) =>
            Effect.logError(`State: error - ${error.reason}`),
          ),
        ),
      ),

      // Log final state
      Effect.tap(() => Effect.logInfo('State: disconnected (final)')),
    );

  return pipe(
    createWebSocketConnection(),
    Effect.flatMap((socket) =>
      monitorConnection(socket, 'ws://localhost:8080' as WebSocketUrl),
    ),
  );
};

/**
 * Example: Type-safe state handling
 *
 * This example shows how the type system prevents invalid operations
 */
export const typeSafeStateHandling = () => {
  // Helper to handle any connection state
  const handleConnectionState = (
    conn: DisconnectedWebSocket | ConnectingWebSocket | ConnectedWebSocket,
  ): Effect.Effect<
    DisconnectedWebSocket | ConnectingWebSocket | ConnectedWebSocket,
    ConnectionError | SendError
  > => {
    switch (conn._tag) {
      case 'disconnected':
        // Only connect is available
        return conn.connect('ws://localhost:8080' as WebSocketUrl);

      case 'connecting':
        // Only wait and abort are available
        return conn.wait();

      case 'connected':
        // Send, receive, disconnect are available
        return pipe(
          conn.send('Hello!' as OutgoingMessage),
          Effect.flatMap(() => conn.disconnect()),
        );
    }
  };

  return pipe(
    createWebSocketConnection(),
    Effect.flatMap(handleConnectionState),
  );
};
