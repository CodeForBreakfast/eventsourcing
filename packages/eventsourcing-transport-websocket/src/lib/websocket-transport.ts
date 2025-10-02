/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport using @effect/platform/Socket abstraction.
 * Provides proper Effect-based WebSocket handling with structured lifecycle management.
 */

import {
  Context,
  Effect,
  Stream,
  Scope,
  Ref,
  Queue,
  PubSub,
  pipe,
  Layer,
  Deferred,
  HashSet,
} from 'effect';
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
  readonly connectionStatePubSub: Readonly<PubSub.PubSub<ConnectionState>>;
  readonly subscribers: HashSet.HashSet<Readonly<Queue.Queue<TransportMessage>>>;
}

interface InternalTransport extends Client.Transport {
  readonly __stateRef: Readonly<Ref.Ref<Readonly<WebSocketInternalState>>>;
}

// =============================================================================
// Pure Functions for ConnectedTransport
// =============================================================================

const createConnectionStateStream = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
): Readonly<Stream.Stream<ConnectionState, never, never>> =>
  Stream.unwrapScoped(
    Ref.get(stateRef).pipe(
      Effect.flatMap((state) =>
        PubSub.subscribe(state.connectionStatePubSub).pipe(
          Effect.map((queue) =>
            Stream.concat(Stream.succeed(state.connectionState), Stream.fromQueue(queue))
          )
        )
      ),
      Effect.orDie
    )
  );

const publishMessage =
  (
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
  ) =>
  (message: Readonly<TransportMessage>): Effect.Effect<void, TransportError, never> =>
    Effect.all([Ref.get(stateRef), Ref.get(writerRef)]).pipe(
      Effect.flatMap(([state, writer]) => {
        if (!writer || state.connectionState !== 'connected') {
          return Effect.fail(
            new TransportError({
              message: 'Cannot publish message: WebSocket is not connected',
            })
          );
        }

        return Effect.sync(() => JSON.stringify(message)).pipe(
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
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) =>
  (
    filter?: (message: Readonly<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    Queue.unbounded<TransportMessage>().pipe(
      Effect.tap((queue) =>
        Ref.update(stateRef, (state) => ({
          ...state,
          subscribers: HashSet.add(state.subscribers, queue),
        }))
      ),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);

        return filter
          ? Stream.filter(baseStream, (msg) =>
              Effect.sync(() => filter(msg)).pipe(
                Effect.catchAll(() => Effect.succeed(false)),
                Effect.runSync
              )
            )
          : baseStream;
      })
    );

const createConnectedTransport = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
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
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  newState: Readonly<ConnectionState>
): Effect.Effect<void, never, never> =>
  Ref.update(stateRef, (state) => ({
    ...state,
    connectionState: newState,
  })).pipe(
    Effect.flatMap(() => Ref.get(stateRef)),
    Effect.flatMap((state) => PubSub.publish(state.connectionStatePubSub, newState))
  );

const distributeMessageToSubscribers = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  message: TransportMessage
) =>
  Ref.get(stateRef).pipe(
    Effect.flatMap((state) =>
      Effect.forEach(state.subscribers, (queue) => Queue.offer(queue, message), {
        discard: true,
      })
    ),
    Effect.asVoid
  );

const handleIncomingMessage = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  data: Readonly<Uint8Array>
): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    try {
      const text = new TextDecoder().decode(data);
      return { _tag: 'success' as const, message: JSON.parse(text) as TransportMessage };
    } catch {
      return { _tag: 'error' as const };
    }
  }).pipe(
    Effect.flatMap((result) =>
      result._tag === 'error'
        ? Effect.void
        : distributeMessageToSubscribers(stateRef, result.message)
    )
  );

const createWebSocketConnection = (
  url: Readonly<string>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
): Effect.Effect<Socket.Socket, ConnectionError, Socket.WebSocketConstructor> =>
  Socket.makeWebSocket(url, {
    openTimeout: 10000,
    closeCodeIsError: (code) => code !== 1000 && code !== 1006,
  }).pipe(
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
  PubSub.unbounded<ConnectionState>().pipe(
    Effect.flatMap((connectionStatePubSub) => {
      const initialState: WebSocketInternalState = {
        socket: null,
        connectionState: 'connecting',
        connectionStatePubSub,
        subscribers: HashSet.empty(),
      };
      return Ref.make(initialState);
    })
  );

const cleanupConnection = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
): Effect.Effect<void, never, never> =>
  Ref.set(writerRef, null).pipe(
    Effect.flatMap(() => updateConnectionState(stateRef, 'disconnected')),
    Effect.flatMap(() =>
      Ref.update(stateRef, (s) => ({
        socket: null,
        connectionState: 'disconnected' as ConnectionState,
        connectionStatePubSub: s.connectionStatePubSub,
        subscribers: HashSet.empty(),
      }))
    ),
    Effect.asVoid
  );

const handleSocketError =
  (
    connectedDeferred: Deferred.Deferred<void, ConnectionError>,
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    url: string
  ) =>
  (error: Socket.SocketError) =>
    Deferred.isDone(connectedDeferred).pipe(
      Effect.flatMap((wasConnected) => {
        if (!wasConnected) {
          const connectionError = new ConnectionError({
            message: 'WebSocket connection failed',
            url,
            cause: error,
          });
          return Deferred.fail(connectedDeferred, connectionError).pipe(
            Effect.flatMap(() => updateConnectionState(stateRef, 'error'))
          );
        }
        if (Socket.SocketCloseError.is(error)) {
          return updateConnectionState(stateRef, 'disconnected');
        }
        return updateConnectionState(stateRef, 'error');
      })
    );

const monitorSocketFiber =
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) => (fiber: unknown) =>
    fiber.await.pipe(
      Effect.flatMap(() => updateConnectionState(stateRef, 'disconnected')),
      Effect.forkScoped
    );

const handleOnOpen = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  connectedDeferred: Deferred.Deferred<void, ConnectionError>
) =>
  updateConnectionState(stateRef, 'connected').pipe(
    Effect.flatMap(() => Deferred.succeed(connectedDeferred, void 0))
  );

const startSocketAndWaitForConnection = (
  socket: Socket.Socket,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>,
  connectedDeferred: Deferred.Deferred<void, ConnectionError>,
  url: string
) =>
  Effect.all({
    fiber: socket
      .run((data: Readonly<Uint8Array>) => handleIncomingMessage(stateRef, data), {
        onOpen: handleOnOpen(stateRef, connectedDeferred),
      })
      .pipe(
        Effect.catchAll(handleSocketError(connectedDeferred, stateRef, url)),
        Effect.forkScoped,
        Effect.tap(monitorSocketFiber(stateRef))
      ),
    _: Deferred.await(connectedDeferred).pipe(
      Effect.timeoutFail({
        duration: 3000,
        onTimeout: () =>
          new ConnectionError({
            message: 'WebSocket connection timeout',
            url,
          }),
      })
    ),
  }).pipe(Effect.map(() => createConnectedTransport(stateRef, writerRef)));

const setupSocketWriter =
  (
    writerRef: Readonly<
      Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>
    >,
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    connectedDeferred: Deferred.Deferred<void, ConnectionError>,
    url: string
  ) =>
  (socket: Socket.Socket) =>
    socket.writer.pipe(
      Effect.tap((writer) => Ref.set(writerRef, (data: string) => writer(data))),
      Effect.flatMap(() =>
        startSocketAndWaitForConnection(socket, stateRef, writerRef, connectedDeferred, url)
      )
    );

const acquireWebSocketConnection = (
  url: string,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>,
  connectedDeferred: Deferred.Deferred<void, ConnectionError>
) =>
  Effect.acquireRelease(
    createWebSocketConnection(url, stateRef).pipe(
      Effect.provide(Socket.layerWebSocketConstructorGlobal)
    ),
    () => cleanupConnection(stateRef, writerRef)
  ).pipe(Effect.flatMap(setupSocketWriter(writerRef, stateRef, connectedDeferred, url)));

const connectWebSocket = (
  url: Readonly<string>
): Effect.Effect<Client.Transport, ConnectionError, Scope.Scope> =>
  Effect.all({
    stateRef: createInitialState(),
    writerRef: Ref.make<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>(null),
    connectedDeferred: Deferred.make<void, ConnectionError>(),
  }).pipe(
    Effect.tap(({ stateRef }) => updateConnectionState(stateRef, 'connecting')),
    Effect.flatMap(({ stateRef, writerRef, connectedDeferred }) =>
      acquireWebSocketConnection(url, stateRef, writerRef, connectedDeferred)
    )
  );

// =============================================================================
// WebSocket Connector Implementation
// =============================================================================

const webSocketConnectorImpl: Context.Tag.Service<typeof Client.Connector> = {
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
