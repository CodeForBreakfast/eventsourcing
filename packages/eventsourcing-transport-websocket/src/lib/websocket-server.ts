/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

import { Effect, Stream, Scope, Ref, Queue, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  TransportError,
  Server,
  Client,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketServerConfig {
  readonly port: number;
  readonly host: string;
}

interface ClientState {
  readonly id: Server.ClientId;
  readonly socket: any; // Bun WebSocket
  connectionState: ConnectionState; // Mutable for simplicity
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribers: Set<Queue.Queue<TransportMessage>>;
  readonly connectedAt: Date;
}

interface ServerState {
  readonly server: any; // Bun Server
  readonly clients: Map<Server.ClientId, ClientState>;
  readonly newConnectionsQueue: Queue.Queue<Server.ClientConnection>;
}

// =============================================================================
// Pure Functions for Client Transport
// =============================================================================

const createClientConnectionStateStream = (
  clientState: ClientState
): Stream.Stream<ConnectionState, never, never> =>
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
  (clientState: ClientState) =>
  (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
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
  (clientState: ClientState) =>
  (
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) =>
        Effect.sync(() => {
          clientState.subscribers.add(queue);
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

const createClientTransport = (clientState: ClientState): Client.Transport<TransportMessage> => ({
  connectionState: createClientConnectionStateStream(clientState),
  publish: publishMessageToClient(clientState),
  subscribe: subscribeToClientMessages(clientState),
});

// =============================================================================
// Pure Functions for Client Connection Management
// =============================================================================

const updateClientConnectionState = (
  clientState: ClientState,
  newState: ConnectionState
): Effect.Effect<void, never, never> =>
  pipe(
    Effect.sync(() => {
      clientState.connectionState = newState;
    }),
    Effect.flatMap(() => Queue.offer(clientState.connectionStateQueue, newState))
  );

const handleClientMessage = (
  clientState: ClientState,
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
  config: WebSocketServerConfig,
  serverStateRef: Ref.Ref<ServerState>
): Effect.Effect<any, Server.ServerStartError, never> =>
  Effect.async<any, Server.ServerStartError>((resume) => {
    try {
      const server = Bun.serve({
        port: config.port,
        hostname: config.host,
        websocket: {
          open: (ws: any) => {
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
                          subscribers: new Set<Queue.Queue<TransportMessage>>(),
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
                        clients: new Map(state.clients.set(clientState.id, clientState)),
                      }))
                    ),
                    Effect.flatMap(() => {
                      ws._clientId = clientState.id;
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

          message: (ws: any, message: string) => {
            Effect.runSync(
              pipe(
                Ref.get(serverStateRef),
                Effect.flatMap((state) => {
                  const clientId = ws._clientId as Server.ClientId;
                  const clientState = state.clients.get(clientId);

                  if (!clientState) {
                    return Effect.void;
                  }

                  return handleClientMessage(clientState, message);
                })
              )
            );
          },

          close: (ws: any) => {
            Effect.runSync(
              pipe(
                Ref.get(serverStateRef),
                Effect.flatMap((state) => {
                  const clientId = ws._clientId as Server.ClientId;
                  const clientState = state.clients.get(clientId);

                  if (!clientState) {
                    return Effect.void;
                  }

                  return pipe(
                    updateClientConnectionState(clientState, 'disconnected'),
                    Effect.flatMap(() =>
                      Ref.update(serverStateRef, (s) => ({
                        ...s,
                        clients: new Map([...s.clients].filter(([id]) => id !== clientId)),
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
  serverStateRef: Ref.Ref<ServerState>,
  connectionsQueue: Queue.Queue<Server.ClientConnection>
): Server.Transport<TransportMessage> & { __serverStateRef: Ref.Ref<ServerState> } => ({
  connections: Stream.fromQueue(connectionsQueue),

  broadcast: (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
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

const cleanupServer = (serverStateRef: Ref.Ref<ServerState>): Effect.Effect<void, never, never> =>
  pipe(
    Ref.get(serverStateRef),
    Effect.flatMap((state) =>
      pipe(
        Effect.sync(() => {
          try {
            // Close all client connections
            for (const clientState of state.clients.values()) {
              try {
                clientState.socket.close();
              } catch {
                // Ignore errors during cleanup
              }
            }

            // Stop the server
            if (state.server && state.server.stop) {
              state.server.stop();
            }
          } catch {
            // Ignore cleanup errors
          }
        }),
        Effect.asVoid
      )
    )
  );

const createWebSocketServerTransport = (
  config: WebSocketServerConfig
): Effect.Effect<Server.Transport<TransportMessage>, Server.ServerStartError, Scope.Scope> =>
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap((newConnectionsQueue) =>
        pipe(
          Ref.make({
            server: null,
            clients: new Map<Server.ClientId, ClientState>(),
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
      const serverStateRef = (transport as any).__serverStateRef;
      return serverStateRef ? cleanupServer(serverStateRef) : Effect.void;
    }
  );

// =============================================================================
// WebSocket Server Acceptor Implementation
// =============================================================================

const webSocketAcceptorImpl = {
  make: (config: WebSocketServerConfig): Effect.Effect<Server.AcceptorInterface, never, never> =>
    Effect.succeed({
      start: () => createWebSocketServerTransport(config),
    }),
};

/**
 * WebSocket server acceptor implementation
 */
export const WebSocketAcceptor = webSocketAcceptorImpl;
