/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

import { Effect, Stream, Scope, Ref, Queue, pipe, Data } from 'effect';
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
  Stream.fromQueue(clientState.connectionStateQueue);

const publishMessageToClient =
  (clientState: ClientState) =>
  (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
    pipe(
      Effect.sync(() => {
        if (clientState.connectionState !== 'connected') {
          throw new TransportError({
            message: 'Cannot publish message: client is not connected',
          });
        }

        const serialized = JSON.stringify(message);
        clientState.socket.send(serialized);
      }),
      Effect.catchAll((error) =>
        Effect.fail(
          new TransportError({
            message: 'Failed to send message to client',
            cause: error,
          })
        )
      )
    );

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
        Effect.forEach(clientState.subscribers, (queue) => Queue.offer(queue, message), {
          discard: true,
        }),
        Effect.asVoid
      );
    })
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
                Effect.sync(() => {
                  const clientId = Server.makeClientId(`client-${Date.now()}-${Math.random()}`);
                  const connectedAt = new Date();

                  return { clientId, connectedAt };
                }),
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
          (clientState) => publishMessageToClient(clientState)(message),
          { discard: true }
        )
      ),
      Effect.asVoid,
      Effect.catchAll(() => Effect.void) // Ignore individual client send failures for broadcast
    ),

  __serverStateRef: serverStateRef,
});

const cleanupServer = (serverStateRef: Ref.Ref<ServerState>): Effect.Effect<void, never, never> =>
  pipe(
    Ref.get(serverStateRef),
    Effect.flatMap((state) =>
      pipe(
        Effect.sync(() => {
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
