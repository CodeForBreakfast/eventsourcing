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
  Layer,
  Deferred,
  HashSet,
  Fiber,
  pipe,
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

const subscribeToConnectionPubSub = (state: Readonly<WebSocketInternalState>) =>
  pipe(
    state.connectionStatePubSub,
    PubSub.subscribe,
    Effect.map((queue) =>
      Stream.concat(Stream.succeed(state.connectionState), Stream.fromQueue(queue))
    )
  );

const createConnectionStateStream = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
): Readonly<Stream.Stream<ConnectionState, never, never>> =>
  Stream.unwrapScoped(
    pipe(stateRef, Ref.get, Effect.flatMap(subscribeToConnectionPubSub), Effect.orDie)
  );

const sendSerializedMessage =
  (writer: (data: string) => Effect.Effect<void, Socket.SocketError>) =>
  (serialized: Readonly<string>) =>
    pipe(
      serialized,
      writer,
      Effect.mapError(
        (error) =>
          new TransportError({
            message: 'Failed to send message through WebSocket',
            cause: error,
          })
      )
    );

const serializeMessage = (
  message: Readonly<TransportMessage>
): Effect.Effect<string, never, never> => Effect.sync(() => JSON.stringify(message));

const serializeAndSend =
  (writer: (data: string) => Effect.Effect<void, Socket.SocketError>) =>
  (message: Readonly<TransportMessage>) =>
    pipe(message, serializeMessage, Effect.flatMap(sendSerializedMessage(writer)));

const getWebSocketInternalState = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
): Effect.Effect<WebSocketInternalState, never, never> => pipe(stateRef, Ref.get);

const getWriter = (
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
): Effect.Effect<
  ((data: string) => Effect.Effect<void, Socket.SocketError>) | null,
  never,
  never
> => pipe(writerRef, Ref.get);

const getStateAndWriter = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
): Effect.Effect<
  readonly [
    WebSocketInternalState,
    ((data: string) => Effect.Effect<void, Socket.SocketError>) | null,
  ],
  never,
  never
> => Effect.all([getWebSocketInternalState(stateRef), getWriter(writerRef)]);

const serializeMessageWithWriter =
  (message: Readonly<TransportMessage>) =>
  (
    writer: (data: string) => Effect.Effect<void, Socket.SocketError>
  ): Effect.Effect<void, TransportError, never> =>
    pipe(message, serializeAndSend(writer));

const publishMessage =
  (
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
  ) =>
  (message: Readonly<TransportMessage>): Effect.Effect<void, TransportError, never> =>
    pipe(
      getStateAndWriter(stateRef, writerRef),
      Effect.flatMap(([state, writer]) => {
        if (!writer || state.connectionState !== 'connected') {
          return Effect.fail(
            new TransportError({
              message: 'Cannot publish message: WebSocket is not connected',
            })
          );
        }

        return serializeMessageWithWriter(message)(writer);
      })
    );

const applyFilterSafely =
  (filter: (message: Readonly<TransportMessage>) => boolean) =>
  (msg: Readonly<TransportMessage>) => {
    try {
      return filter(msg);
    } catch {
      return false;
    }
  };

const addSubscriberToState =
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) =>
  (queue: Queue.Queue<TransportMessage>): Effect.Effect<void, never, never> =>
    pipe(
      stateRef,
      Ref.update((state) => ({
        ...state,
        subscribers: HashSet.add(state.subscribers, queue),
      }))
    );

const subscribeToMessages =
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) =>
  (
    filter?: (message: Readonly<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap(addSubscriberToState(stateRef)),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);

        return filter ? Stream.filter(baseStream, applyFilterSafely(filter)) : baseStream;
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

const getStateRef = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
): Effect.Effect<WebSocketInternalState, never, never> => pipe(stateRef, Ref.get);

const publishToStatePubSub =
  (newState: Readonly<ConnectionState>) =>
  (state: Readonly<WebSocketInternalState>): Effect.Effect<void, never, never> =>
    pipe(state.connectionStatePubSub, PubSub.publish(newState));

const updateConnectionState = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  newState: Readonly<ConnectionState>
): Effect.Effect<void, never, never> =>
  pipe(
    stateRef,
    Ref.update((state) => ({
      ...state,
      connectionState: newState,
    })),
    Effect.flatMap(() => getStateRef(stateRef)),
    Effect.flatMap(publishToStatePubSub(newState))
  );

const offerMessageToQueue =
  (message: TransportMessage) =>
  (queue: Queue.Queue<TransportMessage>): Effect.Effect<void, never, never> =>
    pipe(queue, Queue.offer(message));

const distributeMessageToSubscribers = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  message: TransportMessage
) =>
  pipe(
    stateRef,
    Ref.get,
    Effect.flatMap((state) =>
      Effect.forEach(state.subscribers, offerMessageToQueue(message), {
        discard: true,
      })
    ),
    Effect.asVoid
  );

const parseIncomingData = (
  data: Readonly<Uint8Array>
): Effect.Effect<TransportMessage, unknown, never> =>
  Effect.try(() => {
    const text = new TextDecoder().decode(data);
    return JSON.parse(text) as TransportMessage;
  });

const handleIncomingMessage = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  data: Readonly<Uint8Array>
): Effect.Effect<void, never, never> =>
  pipe(
    data,
    parseIncomingData,
    Effect.flatMap((message) => distributeMessageToSubscribers(stateRef, message)),
    Effect.catchAll(() => Effect.void)
  );

const createWebSocketConnection = (
  url: Readonly<string>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
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
        subscribers: HashSet.empty(),
      };
      return Ref.make(initialState);
    })
  );

const cleanupConnection = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.set(writerRef, null),
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

const failDeferredAndUpdateState = (
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  connectionError: Readonly<ConnectionError>
) =>
  pipe(
    Deferred.fail(connectedDeferred, connectionError),
    Effect.flatMap(() => updateConnectionState(stateRef, 'error'))
  );

const handleSocketError =
  (
    connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    url: Readonly<string>
  ) =>
  (error: Readonly<Socket.SocketError>) =>
    pipe(
      connectedDeferred,
      Deferred.isDone,
      Effect.flatMap((wasConnected) => {
        if (!wasConnected) {
          const connectionError = new ConnectionError({
            message: 'WebSocket connection failed',
            url,
            cause: error,
          });
          return failDeferredAndUpdateState(connectedDeferred, stateRef, connectionError);
        }
        if (Socket.SocketCloseError.is(error)) {
          return updateConnectionState(stateRef, 'disconnected');
        }
        return updateConnectionState(stateRef, 'error');
      })
    );

const monitorSocketFiber =
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) =>
  (fiber: Fiber.RuntimeFiber<void, never>) =>
    pipe(
      fiber,
      Fiber.await,
      Effect.flatMap(() => updateConnectionState(stateRef, 'disconnected')),
      Effect.forkScoped
    );

const handleOnOpen = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  connectedDeferred: Deferred.Deferred<void, ConnectionError>
) =>
  pipe(
    updateConnectionState(stateRef, 'connected'),
    Effect.flatMap(() => Deferred.succeed(connectedDeferred, void 0))
  );

const runSocketWithErrorHandling = (
  socket: Readonly<Socket.Socket>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
  url: Readonly<string>
) =>
  pipe(
    socket.run((data: Readonly<Uint8Array>) => handleIncomingMessage(stateRef, data), {
      onOpen: handleOnOpen(stateRef, connectedDeferred),
    }),
    Effect.catchAll(handleSocketError(connectedDeferred, stateRef, url)),
    Effect.forkScoped,
    Effect.tap(monitorSocketFiber(stateRef))
  );

const awaitConnectionWithTimeout = (
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
  url: Readonly<string>
) =>
  pipe(
    connectedDeferred,
    Deferred.await,
    Effect.timeoutFail({
      duration: 3000,
      onTimeout: () =>
        new ConnectionError({
          message: 'WebSocket connection timeout',
          url,
        }),
    })
  );

const runSocketFiberAndAwaitConnection = (
  socket: Readonly<Socket.Socket>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
  url: Readonly<string>
): Effect.Effect<
  { readonly fiber: Fiber.RuntimeFiber<void, never>; readonly _: void },
  ConnectionError,
  Scope.Scope
> =>
  Effect.all({
    fiber: runSocketWithErrorHandling(socket, stateRef, connectedDeferred, url),
    _: awaitConnectionWithTimeout(connectedDeferred, url),
  });

const startSocketAndWaitForConnection = (
  socket: Readonly<Socket.Socket>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>,
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
  url: Readonly<string>
) =>
  pipe(
    runSocketFiberAndAwaitConnection(socket, stateRef, connectedDeferred, url),
    Effect.map(() => createConnectedTransport(stateRef, writerRef))
  );

const setupSocketWriter =
  (
    writerRef: Readonly<
      Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>
    >,
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>,
    url: Readonly<string>
  ) =>
  (socket: Readonly<Socket.Socket>) =>
    pipe(
      socket.writer,
      Effect.tap((writer) => Ref.set(writerRef, (data: string) => writer(data))),
      Effect.flatMap(() =>
        startSocketAndWaitForConnection(socket, stateRef, writerRef, connectedDeferred, url)
      )
    );

const createWebSocketConnectionWithProvider = (
  url: Readonly<string>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>
) =>
  pipe(
    createWebSocketConnection(url, stateRef),
    Effect.provide(Socket.layerWebSocketConstructorGlobal)
  );

const acquireWebSocketConnection = (
  url: Readonly<string>,
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>,
  connectedDeferred: Readonly<Deferred.Deferred<void, ConnectionError>>
) =>
  pipe(
    Effect.acquireRelease(createWebSocketConnectionWithProvider(url, stateRef), () =>
      cleanupConnection(stateRef, writerRef)
    ),
    Effect.flatMap(setupSocketWriter(writerRef, stateRef, connectedDeferred, url))
  );

const createConnectionResources = (): Effect.Effect<
  {
    readonly stateRef: Ref.Ref<WebSocketInternalState>;
    readonly writerRef: Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>;
    readonly connectedDeferred: Deferred.Deferred<void, ConnectionError>;
  },
  never,
  never
> =>
  Effect.all({
    stateRef: createInitialState(),
    writerRef: Ref.make<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>(null),
    connectedDeferred: Deferred.make<void, ConnectionError>(),
  });

const connectWebSocket = (
  url: Readonly<string>
): Effect.Effect<Client.Transport, ConnectionError, Scope.Scope> =>
  pipe(
    createConnectionResources(),
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
