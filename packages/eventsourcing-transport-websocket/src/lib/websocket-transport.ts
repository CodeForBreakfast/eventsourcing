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
    stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
    writerRef: Readonly<Ref.Ref<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>>
  ) =>
  (message: Readonly<TransportMessage>): Effect.Effect<void, TransportError, never> =>
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
  (stateRef: Readonly<Ref.Ref<WebSocketInternalState>>) =>
  (
    filter?: (message: Readonly<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
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
  pipe(
    Ref.update(stateRef, (state) => ({
      ...state,
      connectionState: newState,
    })),
    Effect.flatMap(() => Ref.get(stateRef)),
    Effect.flatMap((state) => PubSub.publish(state.connectionStatePubSub, newState))
  );

const handleIncomingMessage = (
  stateRef: Readonly<Ref.Ref<WebSocketInternalState>>,
  data: Readonly<Uint8Array>
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

const connectWebSocket = (
  url: Readonly<string>
): Effect.Effect<Client.Transport, ConnectionError, Scope.Scope> =>
  pipe(
    Effect.all({
      stateRef: createInitialState(),
      writerRef: Ref.make<((data: string) => Effect.Effect<void, Socket.SocketError>) | null>(null),
      connectedDeferred: Deferred.make<void, ConnectionError>(),
    }),
    Effect.tap(({ stateRef }) => updateConnectionState(stateRef, 'connecting')),
    Effect.flatMap(({ stateRef, writerRef, connectedDeferred }) =>
      pipe(
        Effect.acquireRelease(
          pipe(
            createWebSocketConnection(url, stateRef),
            Effect.provide(Socket.layerWebSocketConstructorGlobal)
          ),
          () => cleanupConnection(stateRef, writerRef)
        ),
        Effect.flatMap((socket) =>
          pipe(
            socket.writer,
            Effect.tap((writer) => Ref.set(writerRef, (data: string) => writer(data))),
            Effect.flatMap(() =>
              pipe(
                Effect.all({
                  fiber: socket
                    .run((data: Readonly<Uint8Array>) => handleIncomingMessage(stateRef, data), {
                      onOpen: pipe(
                        updateConnectionState(stateRef, 'connected'),
                        Effect.flatMap(() => Deferred.succeed(connectedDeferred, void 0))
                      ),
                    })
                    .pipe(
                      Effect.catchAll((error) =>
                        pipe(
                          Deferred.isDone(connectedDeferred),
                          Effect.flatMap((wasConnected) => {
                            if (!wasConnected) {
                              // Connection failed during initial setup
                              const connectionError = new ConnectionError({
                                message: 'WebSocket connection failed',
                                url,
                                cause: error,
                              });
                              return pipe(
                                Deferred.fail(connectedDeferred, connectionError),
                                Effect.flatMap(() => updateConnectionState(stateRef, 'error'))
                              );
                            }
                            // Connection was established but then closed/errored
                            if (Socket.SocketCloseError.is(error)) {
                              return updateConnectionState(stateRef, 'disconnected');
                            }
                            return updateConnectionState(stateRef, 'error');
                          })
                        )
                      ),
                      Effect.forkScoped,
                      Effect.tap((fiber) =>
                        // Monitor the fiber - when it completes, the socket has closed
                        pipe(
                          fiber.await,
                          Effect.flatMap(() => updateConnectionState(stateRef, 'disconnected')),
                          Effect.forkScoped
                        )
                      )
                    ),
                  // Wait for connection to be established (or fail) with timeout
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
                }),
                Effect.map(() => createConnectedTransport(stateRef, writerRef))
              )
            )
          )
        )
      )
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
