/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport using @effect/platform/Socket abstraction.
 * Provides proper Effect-based WebSocket handling with structured lifecycle management.
 */

import { Effect, Stream, Scope, Ref, Queue, PubSub, pipe, Layer } from 'effect';
import * as Socket from '@effect/platform/Socket';
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
  readonly socket: Socket.Socket | null;
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
  (
    stateRef: Ref.Ref<WebSocketInternalState>,
    writerRef: Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>
  ) =>
  (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
    pipe(
      Effect.all([Ref.get(stateRef), Ref.get(writerRef)]),
      Effect.flatMap(([state, writer]) => {
        if (!writer || state.connectionState !== 'connected') {
          return Effect.fail(
            new TransportError({
              message: 'Cannot publish message: WebSocket is not connected',
            })
          );
        }

        return pipe(
          Effect.sync(() => JSON.stringify(message)),
          Effect.flatMap((serialized) =>
            writer(serialized).pipe(
              Effect.mapError(
                (error) =>
                  new TransportError({
                    message: 'Failed to send message through WebSocket',
                    cause: error,
                  })
              )
            )
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
  stateRef: Ref.Ref<WebSocketInternalState>,
  writerRef: Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>
): InternalTransport => ({
  connectionState: createConnectionStateStream(stateRef),
  publish: publishMessage(stateRef, writerRef),
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
  data: Uint8Array
): Effect.Effect<void, never, never> =>
  pipe(
    Effect.sync(() => {
      try {
        const text = new TextDecoder().decode(data);
        return { _tag: 'success' as const, message: JSON.parse(text) as TransportMessage };
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
): Effect.Effect<Socket.Socket, ConnectionError, Socket.WebSocketConstructor> =>
  pipe(
    Socket.makeWebSocket(url, {
      openTimeout: 10000,
      closeCodeIsError: (code) => code !== 1000 && code !== 1006,
    }),
    Effect.tap((socket) =>
      Ref.update(stateRef, (state) => ({
        ...state,
        socket,
      }))
    ),
    Effect.mapError(
      (error) =>
        new ConnectionError({
          message: 'Failed to connect to WebSocket',
          url,
          cause: error,
        })
    )
  );

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
  stateRef: Ref.Ref<WebSocketInternalState>,
  writerRef: Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.set(writerRef, null),
    Effect.flatMap(() =>
      Ref.update(stateRef, (s) => ({
        socket: null,
        connectionState: 'disconnected' as ConnectionState,
        connectionStatePubSub: s.connectionStatePubSub,
        subscribers: new Set<Queue.Queue<TransportMessage>>(),
      }))
    ),
    Effect.asVoid
  );

const connectWebSocket = (
  url: string
): Effect.Effect<Client.Transport, ConnectionError, Scope.Scope> =>
  Effect.gen(function* () {
    const stateRef = yield* createInitialState();
    const writerRef = yield* Ref.make<
      ((data: string) => Effect.Effect<void, Socket.SocketError>) | null
    >(null);

    yield* updateConnectionState(stateRef, 'connecting');

    const socket = yield* Effect.acquireRelease(
      pipe(
        createWebSocketConnection(url, stateRef),
        Effect.provide(Socket.layerWebSocketConstructorGlobal)
      ),
      () => cleanupConnection(stateRef, writerRef)
    );

    // Set up the writer
    const writer = yield* socket.writer;
    yield* Ref.set(writerRef, (data: string) => writer(data));

    // Start message handler
    yield* socket
      .run((data: Uint8Array) => handleIncomingMessage(stateRef, data), {
        onOpen: updateConnectionState(stateRef, 'connected'),
      })
      .pipe(
        Effect.catchAll((error) => {
          if (Socket.SocketCloseError.is(error)) {
            return updateConnectionState(stateRef, 'disconnected');
          }
          return updateConnectionState(stateRef, 'error');
        }),
        Effect.forkScoped
      );

    return createConnectedTransport(stateRef, writerRef);
  });

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
 * Layer providing WebSocket transport connector service.
 * Includes the WebSocketConstructor dependency for browser/Node.js environments.
 */
export const WebSocketTransportLive = Layer.succeed(Client.Connector, WebSocketConnector);
