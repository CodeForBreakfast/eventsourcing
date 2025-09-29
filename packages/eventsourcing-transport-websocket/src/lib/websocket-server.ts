/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

/* eslint-disable functional/prefer-immutable-types */
// Effect types (Ref, Queue, Stream) contain internal mutable state by design.
// We manage mutations properly through Effect's APIs (Ref.update, etc.) rather than direct mutation.

import { Effect, Stream, Scope, Ref, Queue, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  TransportError,
  Server,
  Client,
} from '@codeforbreakfast/eventsourcing-transport';
import type { ReadonlyDeep } from 'type-fest';

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
  readonly connectionStateRef: Ref.Ref<ConnectionState>;
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribersRef: Ref.Ref<ReadonlySet<Queue.Queue<TransportMessage>>>;
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
  clientState: ReadonlyDeep<ClientState>
): Readonly<Stream.Stream<ConnectionState, never, never>> =>
  Stream.unwrapScoped(
    pipe(
      Ref.get(clientState.connectionStateRef),
      Effect.map((connectionState) =>
        // Provide current state first, then future updates
        Stream.concat(
          Stream.succeed(connectionState),
          Stream.fromQueue(clientState.connectionStateQueue)
        )
      ),
      Effect.orDie
    )
  );

const publishMessageToClient =
  (clientState: ReadonlyDeep<ClientState>) =>
  (message: ReadonlyDeep<TransportMessage>): Effect.Effect<void, TransportError, never> =>
    pipe(
      Ref.get(clientState.connectionStateRef),
      Effect.filterOrFail(
        (connectionState) => connectionState === 'connected',
        () =>
          new TransportError({
            message: 'Cannot publish message: client is not connected',
          })
      ),
      Effect.flatMap(() =>
        Effect.try({
          try: () => {
            const serialized = JSON.stringify(message);
            clientState.socket.send(serialized);
          },
          catch: (error) =>
            new TransportError({
              message: 'Failed to send message to client',
              cause: error,
            }),
        })
      )
    );

const subscribeToClientMessages =
  (clientState: ReadonlyDeep<ClientState>) =>
  (
    filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) =>
        Ref.update(
          clientState.subscribersRef,
          (subscribers) =>
            new Set([...subscribers, queue]) as ReadonlySet<Queue.Queue<TransportMessage>>
        )
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

const createClientTransport = (clientState: ReadonlyDeep<ClientState>): Client.Transport => ({
  connectionState: createClientConnectionStateStream(clientState),
  publish: publishMessageToClient(clientState),
  subscribe: subscribeToClientMessages(clientState),
});

// =============================================================================
// Pure Functions for Client Connection Management
// =============================================================================

const updateClientConnectionState = (
  clientState: ReadonlyDeep<ClientState>,
  newState: ReadonlyDeep<ConnectionState>
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.set(clientState.connectionStateRef, newState),
    Effect.flatMap(() => Queue.offer(clientState.connectionStateQueue, newState))
  );

const handleClientMessage = (
  clientState: ReadonlyDeep<ClientState>,
  data: ReadonlyDeep<string>
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
            Ref.get(clientState.subscribersRef),
            Effect.flatMap((subscribers) =>
              Effect.forEach(subscribers, (queue) => Queue.offer(queue, result.message), {
                discard: true,
              })
            ),
            Effect.asVoid
          )
    )
  );

// =============================================================================
// WebSocket Server Implementation
// =============================================================================

const createWebSocketServer = (
  config: ReadonlyDeep<WebSocketServerConfig>,
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>
): Effect.Effect<Bun.Server, Server.ServerStartError, never> =>
  Effect.async<Bun.Server, Server.ServerStartError>((resume) => {
    try {
      const server = Bun.serve({
        port: config.port,
        hostname: config.host,
        websocket: {
          open: (ws: ReadonlyDeep<ServerWebSocket<{ readonly clientId: Server.ClientId }>>) => {
            Effect.runSync(
              pipe(
                Effect.sync(() => ({
                  clientId: Server.makeClientId(`client-${Date.now()}-${Math.random()}`),
                  connectedAt: new Date(),
                })),
                Effect.flatMap(({ clientId, connectedAt }) =>
                  pipe(
                    Effect.all({
                      connectionStateQueue: Queue.unbounded<ConnectionState>(),
                      connectionStateRef: Ref.make<ConnectionState>('connecting'),
                      subscribersRef: Ref.make<ReadonlySet<Queue.Queue<TransportMessage>>>(
                        new Set() as ReadonlySet<Queue.Queue<TransportMessage>>
                      ),
                    }),
                    Effect.map(
                      ({ connectionStateQueue, connectionStateRef, subscribersRef }) =>
                        ({
                          id: clientId,
                          socket: ws,
                          connectionStateRef,
                          connectionStateQueue,
                          subscribersRef,
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
                        clients: new Map([
                          ...state.clients,
                          [clientState.id, clientState],
                        ]) as ReadonlyMap<Server.ClientId, Readonly<ClientState>>,
                      }))
                    ),
                    Effect.flatMap(() => {
                      // eslint-disable-next-line functional/immutable-data
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
            ws: ReadonlyDeep<ServerWebSocket<{ readonly clientId: Server.ClientId }>>,
            message: ReadonlyDeep<string>
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

          close: (ws: ReadonlyDeep<ServerWebSocket<{ readonly clientId: Server.ClientId }>>) => {
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
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
  connectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
): Server.Transport & { readonly __serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>> } => ({
  connections: Stream.fromQueue(connectionsQueue),

  broadcast: (
    message: ReadonlyDeep<TransportMessage>
  ): Effect.Effect<void, TransportError, never> =>
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
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>
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
  config: ReadonlyDeep<WebSocketServerConfig>
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
          readonly __serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>;
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
    config: ReadonlyDeep<WebSocketServerConfig>
  ): Effect.Effect<Server.AcceptorInterface, never, never> =>
    Effect.succeed({
      start: () => createWebSocketServerTransport(config),
    }),
};

/**
 * WebSocket server acceptor implementation
 */
export const WebSocketAcceptor = webSocketAcceptorImpl;
