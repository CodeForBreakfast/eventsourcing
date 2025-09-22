/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport that implements the simplified transport contracts.
 * Uses Effect.acquireRelease for Scope-based lifecycle management.
 */

import { Effect, Stream, Scope, Ref, Queue, PubSub, Chunk, pipe, Layer } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketInternalState {
  readonly socket: WebSocket | null;
  readonly connectionState: ConnectionState;
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly stateHistory: Chunk.Chunk<ConnectionState>;
  readonly subscribers: Set<Queue.Queue<TransportMessage>>;
}

interface InternalTransport extends Client.Transport<TransportMessage> {
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
            // Provide historical states first, then future updates
            Stream.concat(Stream.fromChunk(state.stateHistory), Stream.fromQueue(queue))
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

        return Effect.try({
          try: () => {
            const serialized = JSON.stringify(message);
            state.socket!.send(serialized);
          },
          catch: (error) =>
            new TransportError({
              message: 'Failed to send message through WebSocket',
              cause: error,
            }),
        });
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
        let stream = Stream.fromQueue(queue);

        if (filter) {
          stream = Stream.filter(stream, (msg) => {
            try {
              return filter(msg);
            } catch {
              return false;
            }
          });
        }

        return stream;
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
      stateHistory: Chunk.append(state.stateHistory, newState),
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
        return JSON.parse(data) as TransportMessage;
      } catch {
        return null;
      }
    }),
    Effect.flatMap((message) => {
      if (message === null) {
        return Effect.void;
      }

      return pipe(
        Ref.get(stateRef),
        Effect.flatMap((state) =>
          Effect.forEach(state.subscribers, (queue) => Queue.offer(queue, message), {
            discard: true,
          })
        ),
        Effect.asVoid
      );
    })
  );

const createWebSocketConnection = (
  url: string,
  stateRef: Ref.Ref<WebSocketInternalState>
): Effect.Effect<void, ConnectionError, never> =>
  Effect.async<void, ConnectionError>((resume) => {
    try {
      const socket = new WebSocket(url);

      socket.onopen = () => {
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
      };

      socket.onmessage = (event) => {
        Effect.runSync(handleIncomingMessage(stateRef, event.data));
      };

      socket.onclose = () => {
        Effect.runSync(updateConnectionState(stateRef, 'disconnected'));
      };
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
        stateHistory: Chunk.empty<ConnectionState>(),
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
          if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
            state.socket.close();
          }
        }),
        Effect.flatMap(() =>
          Ref.update(stateRef, (s) => ({
            socket: null,
            connectionState: 'disconnected' as ConnectionState,
            connectionStatePubSub: s.connectionStatePubSub,
            stateHistory: s.stateHistory,
            subscribers: new Set<Queue.Queue<TransportMessage>>(),
          }))
        )
      )
    ),
    Effect.asVoid
  );

const connectWebSocket = (
  url: string
): Effect.Effect<Client.Transport<TransportMessage>, ConnectionError, Scope.Scope> =>
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

const webSocketConnectorImpl: Client.ConnectorInterface<TransportMessage> = {
  connect: connectWebSocket,
};

// =============================================================================
// Service Implementation and Layer
// =============================================================================

/**
 * WebSocket connector implementation that can be used directly
 */
export const WebSocketConnector = webSocketConnectorImpl;

/**
 * Layer providing WebSocket transport connector service
 */
export const WebSocketTransportLive = Layer.succeed(Client.Connector, WebSocketConnector);
