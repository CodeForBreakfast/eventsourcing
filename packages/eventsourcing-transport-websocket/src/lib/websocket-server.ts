/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

/* eslint-disable functional/immutable-data, functional/prefer-immutable-types, functional/prefer-readonly-type */

import { Effect, Stream, Scope, Ref, Queue, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  TransportError,
  Server,
  Client,
} from '@codeforbreakfast/eventsourcing-transport';

type ServerWebSocket<T = undefined> = Bun.ServerWebSocket<T>;

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketServerConfig {
  readonly port: number;
  readonly host: string;
}

interface ClientState {
  readonly id: Server.ClientId;
  readonly socket: ServerWebSocket<{ readonly clientId: Server.ClientId }>; // Bun WebSocket
  readonly connectionState: ConnectionState; // Make readonly in interface but mutable internally
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribers: ReadonlySet<Queue.Queue<TransportMessage>>;
  readonly connectedAt: Date;
}

interface ServerState {
  readonly server: Bun.Server | null; // Bun Server
  readonly clients: ReadonlyMap<Server.ClientId, Readonly<ClientState>>;
  readonly newConnectionsQueue: Readonly<Queue.Queue<Server.ClientConnection>>;
}

// =============================================================================
// Pure Functions for Client Transport
// =============================================================================

const createClientConnectionStateStream = (
  clientState: Readonly<ClientState>
): Readonly<Stream.Stream<ConnectionState, never, never>> =>
  Stream.unwrapScoped(
    pipe(
      Effect.succeed(clientState),
      Effect.map((state) =>
        // Provide current state first, then future updates
        Stream.concat(
          Stream.succeed(state.connectionState),
          Stream.fromQueue(state.connectionStateQueue)
        )
      ),
      Effect.orDie
    )
  );

const publishMessageToClient =
  (clientState: Readonly<ClientState>) =>
  (message: Readonly<TransportMessage>): Effect.Effect<void, TransportError, never> =>
    Effect.try({
      try: () => {
        if (clientState.connectionState !== 'connected') {
          throw new Error('Cannot publish message: client is not connected');
        }

        const serialized = JSON.stringify(message);
        clientState.socket.send(serialized);
      },
      catch: (error) =>
        new TransportError({
          message: 'Failed to send message to client',
          cause: error,
        }),
    });

const subscribeToClientMessages =
  (clientState: Readonly<ClientState>) =>
  (
    filter?: (message: Readonly<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) =>
        Effect.sync(() => {
          (clientState.subscribers as Set<Readonly<Queue.Queue<TransportMessage>>>).add(queue);
        })
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

const createClientTransport = (clientState: Readonly<ClientState>): Client.Transport => ({
  connectionState: createClientConnectionStateStream(clientState),
  publish: publishMessageToClient(clientState),
  subscribe: subscribeToClientMessages(clientState),
});

// =============================================================================
// Pure Functions for Client Connection Management
// =============================================================================

const updateClientConnectionState = (
  clientState: Readonly<ClientState>,
  newState: Readonly<ConnectionState>
): Effect.Effect<void, never, never> =>
  pipe(
    Effect.sync(() => {
      (clientState as { connectionState: ConnectionState }).connectionState = newState;
    }),
    Effect.flatMap(() => Queue.offer(clientState.connectionStateQueue, newState))
  );

const handleClientMessage = (
  clientState: Readonly<ClientState>,
  data: Readonly<string>
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
            Effect.forEach(clientState.subscribers, (queue) => Queue.offer(queue, result.message), {
              discard: true,
            }),
            Effect.asVoid
          )
    )
  );

// =============================================================================
// WebSocket Server Implementation
// =============================================================================

const createWebSocketServer = (
  config: Readonly<WebSocketServerConfig>,
  serverStateRef: Readonly<Ref.Ref<ServerState>>
): Effect.Effect<Bun.Server, Server.ServerStartError, never> =>
  Effect.async<Bun.Server, Server.ServerStartError>((resume) => {
    try {
      const server = Bun.serve({
        port: config.port,
        hostname: config.host,
        websocket: {
          open: (ws: Readonly<ServerWebSocket<{ readonly clientId: Server.ClientId }>>) => {
            Effect.runSync(
              pipe(
                Effect.sync(() => ({
                  clientId: Server.makeClientId(`client-${Date.now()}-${Math.random()}`),
                  connectedAt: new Date(),
                })),
                Effect.flatMap(({ clientId, connectedAt }) =>
                  pipe(
                    Queue.unbounded<ConnectionState>(),
                    Effect.map(
                      (connectionStateQueue) =>
                        ({
                          id: clientId,
                          socket: ws,
                          connectionState: 'connecting' as ConnectionState,
                          connectionStateQueue,
                          subscribers: new Set<Queue.Queue<TransportMessage>>() as ReadonlySet<
                            Queue.Queue<TransportMessage>
                          >,
                          connectedAt,
                        }) as ClientState
                    )
                  )
                ),
                Effect.flatMap((clientState) =>
                  pipe(
                    // First emit "connecting" state
                    updateClientConnectionState(clientState, 'connecting'),
                    Effect.flatMap(() =>
                      Ref.update(serverStateRef, (state) => ({
                        ...state,
                        clients: new Map(
                          (state.clients as Map<Server.ClientId, Readonly<ClientState>>).set(
                            clientState.id,
                            clientState
                          )
                        ) as ReadonlyMap<Server.ClientId, Readonly<ClientState>>,
                      }))
                    ),
                    Effect.flatMap(() => {
                      (ws as ServerWebSocket<{ readonly clientId: Server.ClientId }>).data = {
                        clientId: clientState.id,
                      };
                      // Now transition to "connected"
                      return updateClientConnectionState(clientState, 'connected');
                    }),
                    Effect.flatMap(() => Ref.get(serverStateRef)),
                    Effect.flatMap((state) =>
                      Queue.offer(state.newConnectionsQueue, {
                        clientId: clientState.id,
                        transport: createClientTransport(clientState),
                        connectedAt: clientState.connectedAt,
                        metadata: {},
                      })
                    )
                  )
                )
              )
            );
          },

          message: (
            ws: Readonly<ServerWebSocket<{ readonly clientId: Server.ClientId }>>,
            message: Readonly<string>
          ) => {
            Effect.runSync(
              pipe(
                Ref.get(serverStateRef),
                Effect.flatMap((state) => {
                  const clientId = ws.data.clientId;
                  const clientState = state.clients.get(clientId);

                  if (!clientState) {
                    return Effect.void;
                  }

                  return handleClientMessage(clientState, message);
                })
              )
            );
          },

          close: (ws: Readonly<ServerWebSocket<{ readonly clientId: Server.ClientId }>>) => {
            Effect.runSync(
              pipe(
                Ref.get(serverStateRef),
                Effect.flatMap((state) => {
                  const clientId = ws.data.clientId;
                  const clientState = state.clients.get(clientId);

                  if (!clientState) {
                    return Effect.void;
                  }

                  return pipe(
                    updateClientConnectionState(clientState, 'disconnected'),
                    Effect.flatMap(() =>
                      Ref.update(serverStateRef, (s) => ({
                        ...s,
                        clients: new Map(
                          [...s.clients].filter(([id]) => id !== clientId)
                        ) as ReadonlyMap<Server.ClientId, ClientState>,
                      }))
                    )
                  );
                })
              )
            );
          },
        },

        fetch: (req, server) => {
          const success = server.upgrade(req);
          if (success) {
            return undefined;
          }
          return new Response('WebSocket upgrade failed', { status: 400 });
        },
      });

      resume(Effect.succeed(server));
    } catch (error) {
      resume(
        Effect.fail(
          new Server.ServerStartError({
            message: 'Failed to start WebSocket server',
            cause: error,
          })
        )
      );
    }
  });

const createServerTransport = (
  serverStateRef: Readonly<Ref.Ref<ServerState>>,
  connectionsQueue: Readonly<Queue.Queue<Server.ClientConnection>>
): Server.Transport & { readonly __serverStateRef: Readonly<Ref.Ref<ServerState>> } => ({
  connections: Stream.fromQueue(connectionsQueue),

  broadcast: (message: Readonly<TransportMessage>): Effect.Effect<void, TransportError, never> =>
    pipe(
      Ref.get(serverStateRef),
      Effect.flatMap((state) =>
        Effect.forEach(
          Array.from(state.clients.values()),
          (clientState) =>
            pipe(
              publishMessageToClient(clientState)(message),
              Effect.catchAll(() => Effect.void) // Ignore individual client failures
            ),
          { discard: true }
        )
      ),
      Effect.asVoid
    ),

  __serverStateRef: serverStateRef,
});

const cleanupServer = (
  serverStateRef: Readonly<Ref.Ref<ServerState>>
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.get(serverStateRef),
    Effect.flatMap((state) =>
      pipe(
        // First, notify all clients they're being disconnected
        Effect.forEach(
          Array.from(state.clients.values()),
          (clientState) =>
            pipe(
              updateClientConnectionState(clientState, 'disconnected'),
              Effect.catchAll(() => Effect.void) // Ignore errors during cleanup
            ),
          { discard: true }
        ),
        Effect.flatMap(() =>
          Effect.sync(() => {
            try {
              // Close all client connections
              Array.from(state.clients.values()).forEach((clientState) => {
                try {
                  clientState.socket.close(1001, 'Server shutting down');
                } catch {
                  // Ignore errors during cleanup
                }
              });

              // Stop the server
              if (state.server && state.server.stop) {
                state.server.stop();
              }
            } catch {
              // Ignore cleanup errors
            }
          })
        ),
        Effect.asVoid
      )
    )
  );

const createWebSocketServerTransport = (
  config: Readonly<WebSocketServerConfig>
): Effect.Effect<Server.Transport, Server.ServerStartError, Scope.Scope> =>
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap((newConnectionsQueue) =>
        pipe(
          Ref.make({
            server: null,
            clients: new Map<Server.ClientId, ClientState>() as ReadonlyMap<
              Server.ClientId,
              ClientState
            >,
            newConnectionsQueue,
          } as ServerState),
          Effect.flatMap((serverStateRef) =>
            pipe(
              createWebSocketServer(config, serverStateRef),
              Effect.flatMap((server) =>
                pipe(
                  Ref.update(serverStateRef, (state) => ({ ...state, server })),
                  Effect.as(createServerTransport(serverStateRef, newConnectionsQueue))
                )
              )
            )
          )
        )
      )
    ),
    (transport) => {
      const serverStateRef = (
        transport as Server.Transport & {
          readonly __serverStateRef: Readonly<Ref.Ref<ServerState>>;
        }
      ).__serverStateRef;
      return serverStateRef ? cleanupServer(serverStateRef) : Effect.void;
    }
  );

// =============================================================================
// WebSocket Server Acceptor Implementation
// =============================================================================

const webSocketAcceptorImpl = {
  make: (
    config: Readonly<WebSocketServerConfig>
  ): Effect.Effect<Server.AcceptorInterface, never, never> =>
    Effect.succeed({
      start: () => createWebSocketServerTransport(config),
    }),
};

/**
 * WebSocket server acceptor implementation
 */
export const WebSocketAcceptor = webSocketAcceptorImpl;
