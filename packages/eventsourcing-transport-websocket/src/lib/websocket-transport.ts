/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport that implements the simplified transport contracts.
 * Uses Effect.acquireRelease for Scope-based lifecycle management.
 */

import { Effect, Stream, Scope, Ref, Queue, pipe, Layer } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  type ConnectedTransport,
  type TransportConnectorInterface,
  TransportConnector,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketInternalState {
  readonly socket: WebSocket | null;
  readonly connectionState: ConnectionState;
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribers: Set<Queue.Queue<TransportMessage>>;
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
          Queue.unbounded<ConnectionState>(),
          Effect.tap((stateQueue) => Queue.offer(stateQueue, state.connectionState)),
          Effect.flatMap((stateQueue) =>
            pipe(
              Stream.fromQueue(state.connectionStateQueue),
              Stream.runForEach((newState) => Queue.offer(stateQueue, newState)),
              Effect.fork,
              Effect.as(Stream.fromQueue(stateQueue))
            )
          )
        )
      ),
      Effect.orDie
    ) as Effect.Effect<Stream.Stream<ConnectionState, never, never>, never, never>
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
): ConnectedTransport<TransportMessage> & { __stateRef: Ref.Ref<WebSocketInternalState> } => ({
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
    Effect.flatMap((state) => Queue.offer(state.connectionStateQueue, newState))
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
              connectionState: 'connected' as ConnectionState,
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
    Queue.unbounded<ConnectionState>(),
    Effect.flatMap((connectionStateQueue) => {
      const initialState: WebSocketInternalState = {
        socket: null,
        connectionState: 'connecting',
        connectionStateQueue,
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
            connectionStateQueue: s.connectionStateQueue,
            subscribers: new Set<Queue.Queue<TransportMessage>>(),
          }))
        )
      )
    ),
    Effect.asVoid
  );

const connectWebSocket = (
  url: string
): Effect.Effect<ConnectedTransport<TransportMessage>, ConnectionError, Scope.Scope> =>
  Effect.acquireRelease(
    pipe(
      createInitialState(),
      Effect.tap((stateRef) => updateConnectionState(stateRef, 'connecting')),
      Effect.flatMap((stateRef) =>
        pipe(
          createWebSocketConnection(url, stateRef),
          Effect.as(createConnectedTransport(stateRef))
        )
      )
    ),
    (transport) => {
      const transportWithState = transport as ConnectedTransport<TransportMessage> & {
        __stateRef: Ref.Ref<WebSocketInternalState>;
      };

      return cleanupConnection(transportWithState.__stateRef);
    }
  );

// =============================================================================
// WebSocket Connector Implementation
// =============================================================================

const webSocketConnectorImpl: TransportConnectorInterface<TransportMessage> = {
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
export const WebSocketTransportLive = Layer.succeed(TransportConnector, WebSocketConnector);
