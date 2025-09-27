/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport that implements the simplified transport contracts.
 * Uses Effect.acquireRelease for Scope-based lifecycle management.
 */

import { Effect, Stream, Scope, Ref, Queue, PubSub, pipe, Layer } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
} from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketInternalState {
  readonly socket: WebSocket | null;
  readonly connectionState: ConnectionState;
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly subscribers: Set<Queue.Queue<TransportMessage>>;
}

interface InternalTransport extends Client.Transport {
  readonly __stateRef: Ref.Ref<WebSocketInternalState>;
}

// =============================================================================
// Pure Functions for ConnectedTransport
// =============================================================================

const createConnectionStateStream = (
  stateRef: Ref.Ref<WebSocketInternalState>
): Stream.Stream<ConnectionState, never, never> =>
  Stream.unwrapScoped(
    pipe(
      Ref.get(stateRef),
      Effect.flatMap((state) =>
        pipe(
          // Subscribe to future updates
          PubSub.subscribe(state.connectionStatePubSub),
          Effect.map((queue) =>
            // Provide current state first, then future updates
            Stream.concat(Stream.succeed(state.connectionState), Stream.fromQueue(queue))
          )
        )
      ),
      Effect.orDie
    )
  );

const publishMessage =
  (stateRef: Ref.Ref<WebSocketInternalState>) =>
  (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
    pipe(
      Ref.get(stateRef),
      Effect.flatMap((state) => {
        if (!state.socket || state.connectionState !== 'connected') {
          return Effect.fail(
            new TransportError({
              message: 'Cannot publish message: WebSocket is not connected',
            })
          );
        }

        return pipe(
          Effect.sync(() => JSON.stringify(message)),
          Effect.flatMap((serialized) =>
            Effect.try({
              try: () => state.socket!.send(serialized),
              catch: (error) =>
                new TransportError({
                  message: 'Failed to send message through WebSocket',
                  cause: error,
                }),
            })
          )
        );
      })
    );

const subscribeToMessages =
  (stateRef: Ref.Ref<WebSocketInternalState>) =>
  (
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) =>
        Ref.update(stateRef, (state) => ({
          ...state,
          subscribers: new Set([...state.subscribers, queue]),
        }))
      ),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);

        return filter
          ? Stream.filter(baseStream, (msg) =>
              pipe(
                Effect.sync(() => filter(msg)),
                Effect.catchAll(() => Effect.succeed(false)),
                Effect.runSync
              )
            )
          : baseStream;
      })
    );

const createConnectedTransport = (
  stateRef: Ref.Ref<WebSocketInternalState>
): InternalTransport => ({
  connectionState: createConnectionStateStream(stateRef),
  publish: publishMessage(stateRef),
  subscribe: subscribeToMessages(stateRef),
  __stateRef: stateRef,
});

// =============================================================================
// Pure Functions for WebSocket Operations
// =============================================================================

const updateConnectionState = (
  stateRef: Ref.Ref<WebSocketInternalState>,
  newState: ConnectionState
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.update(stateRef, (state) => ({
      ...state,
      connectionState: newState,
    })),
    Effect.flatMap(() => Ref.get(stateRef)),
    Effect.flatMap((state) => PubSub.publish(state.connectionStatePubSub, newState))
  );

const handleIncomingMessage = (
  stateRef: Ref.Ref<WebSocketInternalState>,
  data: string
): Effect.Effect<void, never, never> =>
  pipe(
    Effect.sync(() => {
      try {
        return { _tag: 'success' as const, message: JSON.parse(data) as TransportMessage };
      } catch {
        return { _tag: 'error' as const };
      }
    }),
    Effect.flatMap((result) =>
      result._tag === 'error'
        ? Effect.void
        : pipe(
            Ref.get(stateRef),
            Effect.flatMap((state) =>
              Effect.forEach(state.subscribers, (queue) => Queue.offer(queue, result.message), {
                discard: true,
              })
            ),
            Effect.asVoid
          )
    )
  );

const createWebSocketConnection = (
  url: string,
  stateRef: Ref.Ref<WebSocketInternalState>
): Effect.Effect<void, ConnectionError, never> =>
  Effect.async<void, ConnectionError>((resume, signal) => {
    try {
      const socket = new WebSocket(url);
      let hasResolved = false;

      socket.onopen = () => {
        if (hasResolved) return;
        hasResolved = true;

        Effect.runSync(
          pipe(
            Ref.update(stateRef, (state) => ({
              ...state,
              socket,
            })),
            Effect.flatMap(() => updateConnectionState(stateRef, 'connected'))
          )
        );
        resume(Effect.void);
      };

      socket.onerror = (event) => {
        if (!hasResolved) {
          hasResolved = true;
          Effect.runSync(updateConnectionState(stateRef, 'error'));
          resume(
            Effect.fail(
              new ConnectionError({
                message: 'Failed to connect to WebSocket',
                url,
                cause: event,
              })
            )
          );
        }
      };

      socket.onclose = (event) => {
        Effect.runSync(updateConnectionState(stateRef, 'disconnected'));

        // If we haven't resolved yet and we're closing, it means connection failed
        if (!hasResolved) {
          hasResolved = true;
          resume(
            Effect.fail(
              new ConnectionError({
                message: 'WebSocket connection closed before opening',
                url,
                cause: event,
              })
            )
          );
        }
      };

      socket.onmessage = (event) => {
        Effect.runSync(handleIncomingMessage(stateRef, event.data));
      };

      // Handle abort signal
      signal.addEventListener('abort', () => {
        try {
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            socket.close();
          }
        } catch {
          // Ignore cleanup errors
        }
      });

      // Return cleanup Effect
      return Effect.sync(() => {
        try {
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            socket.close();
          }
        } catch {
          // Ignore cleanup errors
        }
      });
    } catch (error) {
      resume(
        Effect.fail(
          new ConnectionError({
            message: 'Failed to create WebSocket connection',
            url,
            cause: error,
          })
        )
      );
      return Effect.void; // No cleanup needed if socket creation failed
    }
  });

const createInitialState = (): Effect.Effect<Ref.Ref<WebSocketInternalState>, never, never> =>
  pipe(
    PubSub.unbounded<ConnectionState>(),
    Effect.flatMap((connectionStatePubSub) => {
      const initialState: WebSocketInternalState = {
        socket: null,
        connectionState: 'connecting',
        connectionStatePubSub,
        subscribers: new Set(),
      };
      return Ref.make(initialState);
    })
  );

const cleanupConnection = (
  stateRef: Ref.Ref<WebSocketInternalState>
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.get(stateRef),
    Effect.flatMap((state) =>
      pipe(
        Effect.sync(() => {
          try {
            if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
              state.socket.close();
            }
          } catch {
            // Ignore cleanup errors
          }
        }),
        Effect.flatMap(() =>
          Ref.update(stateRef, (s) => ({
            socket: null,
            connectionState: 'disconnected' as ConnectionState,
            connectionStatePubSub: s.connectionStatePubSub,
            subscribers: new Set<Queue.Queue<TransportMessage>>(),
          }))
        ),
        Effect.asVoid
      )
    )
  );

const connectWebSocket = (
  url: string
): Effect.Effect<Client.Transport, ConnectionError, Scope.Scope> =>
  Effect.acquireRelease(
    pipe(
      createInitialState(),
      Effect.flatMap((stateRef) =>
        pipe(
          updateConnectionState(stateRef, 'connecting'),
          Effect.flatMap(() => createWebSocketConnection(url, stateRef)),
          Effect.as(createConnectedTransport(stateRef))
        )
      )
    ),
    (transport) => cleanupConnection((transport as InternalTransport).__stateRef)
  );

// =============================================================================
// WebSocket Connector Implementation
// =============================================================================

const webSocketConnectorImpl: Client.ConnectorInterface = {
  connect: connectWebSocket,
};

// =============================================================================
// Service Implementation and Layer
// =============================================================================

/**
 * WebSocket connector implementation
 */
export const WebSocketConnector = webSocketConnectorImpl;

/**
 * Layer providing WebSocket transport connector service
 */
export const WebSocketTransportLive = Layer.succeed(Client.Connector, WebSocketConnector);
