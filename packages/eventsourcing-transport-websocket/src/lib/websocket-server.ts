/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

import { Context, Effect, Stream, Scope, Ref, Queue, HashSet, HashMap, pipe } from 'effect';
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
  readonly subscribersRef: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
  readonly connectedAt: Date;
}

interface ServerState {
  readonly server: Bun.Server | null; // Bun Server
  readonly clients: HashMap.HashMap<Server.ClientId, Readonly<ClientState>>;
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

const applyFilterToMessage =
  (filter: (message: ReadonlyDeep<TransportMessage>) => boolean) =>
  (msg: TransportMessage): boolean =>
    pipe(
      Effect.sync(() => filter(msg)),
      Effect.catchAll(() => Effect.succeed(false)),
      Effect.runSync
    );

const subscribeToClientMessages =
  (clientState: ReadonlyDeep<ClientState>) =>
  (
    filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) => Ref.update(clientState.subscribersRef, HashSet.add(queue))),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);

        return filter ? Stream.filter(baseStream, applyFilterToMessage(filter)) : baseStream;
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

const distributeMessageToSubscribers = (
  clientState: ReadonlyDeep<ClientState>,
  message: TransportMessage
): Effect.Effect<void, never, never> =>
  pipe(
    Ref.get(clientState.subscribersRef),
    Effect.flatMap((subscribers) =>
      Effect.forEach(subscribers, (queue) => Queue.offer(queue, message), {
        discard: true,
      })
    ),
    Effect.asVoid
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
        : distributeMessageToSubscribers(clientState, result.message)
    )
  );

// =============================================================================
// WebSocket Server Implementation
// =============================================================================

const createClientStateResources = (
  clientId: Server.ClientId,
  connectedAt: Date,
  ws: ReadonlyDeep<ServerWebSocket<{ readonly clientId: Server.ClientId }>>
): Effect.Effect<ClientState, never, never> =>
  pipe(
    Effect.all({
      connectionStateQueue: Queue.unbounded<ConnectionState>(),
      connectionStateRef: Ref.make<ConnectionState>('connecting'),
      subscribersRef: Ref.make(HashSet.empty<Queue.Queue<TransportMessage>>()),
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
  );

const registerClientAndTransition =
  (
    serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
    ws: ReadonlyDeep<ServerWebSocket<{ readonly clientId: Server.ClientId }>>
  ) =>
  (clientState: ClientState): Effect.Effect<void, never, never> =>
    pipe(
      updateClientConnectionState(clientState, 'connecting'),
      Effect.flatMap(() =>
        Ref.update(serverStateRef, (state) => ({
          ...state,
          clients: HashMap.set(state.clients, clientState.id, clientState),
        }))
      ),
      Effect.flatMap(() => {
        // eslint-disable-next-line functional/immutable-data
        (ws as ServerWebSocket<{ readonly clientId: Server.ClientId }>).data = {
          clientId: clientState.id,
        };
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
    );

const processClientMessage = (
  state: ServerState,
  clientId: Server.ClientId,
  message: ReadonlyDeep<string>
): Effect.Effect<void, never, never> =>
  pipe(
    HashMap.get(state.clients, clientId),
    Effect.map((clientState) => handleClientMessage(clientState, message)),
    Effect.flatten,
    Effect.orElse(() => Effect.void)
  );

const disconnectClientAndCleanup =
  (serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>) =>
  (clientState: ClientState): Effect.Effect<void, never, never> =>
    pipe(
      updateClientConnectionState(clientState, 'disconnected'),
      Effect.flatMap(() =>
        Ref.update(serverStateRef, (s) => ({
          ...s,
          clients: HashMap.remove(s.clients, clientState.id),
        }))
      )
    );

const handleClientDisconnection = (
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
  state: ServerState,
  clientId: Server.ClientId
): Effect.Effect<void, never, never> =>
  pipe(
    HashMap.get(state.clients, clientId),
    Effect.map(disconnectClientAndCleanup(serverStateRef)),
    Effect.flatten,
    Effect.orElse(() => Effect.void)
  );

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
                  createClientStateResources(clientId, connectedAt, ws)
                ),
                Effect.flatMap(registerClientAndTransition(serverStateRef, ws))
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
                  return processClientMessage(state, clientId, message);
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
                  return handleClientDisconnection(serverStateRef, state, clientId);
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

const broadcastToSingleClient =
  (message: ReadonlyDeep<TransportMessage>) =>
  (clientState: ReadonlyDeep<ClientState>): Effect.Effect<void, never, never> =>
    pipe(
      publishMessageToClient(clientState)(message),
      Effect.catchAll(() => Effect.void)
    );

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
        Effect.forEach(HashMap.values(state.clients), broadcastToSingleClient(message), {
          discard: true,
        })
      ),
      Effect.asVoid
    ),

  __serverStateRef: serverStateRef,
});

const notifySingleClientDisconnected = (
  clientState: ReadonlyDeep<ClientState>
): Effect.Effect<void, never, never> =>
  pipe(
    updateClientConnectionState(clientState, 'disconnected'),
    Effect.catchAll(() => Effect.void)
  );

const shutdownServerResources = (state: ServerState): Effect.Effect<void, never, never> =>
  pipe(
    Effect.forEach(HashMap.values(state.clients), notifySingleClientDisconnected, {
      discard: true,
    }),
    Effect.flatMap(() =>
      Effect.sync(() => {
        try {
          Array.from(HashMap.values(state.clients)).forEach((clientState) => {
            try {
              clientState.socket.close(1001, 'Server shutting down');
            } catch {
              // Ignore errors during cleanup
            }
          });

          if (state.server && state.server.stop) {
            state.server.stop();
          }
        } catch {
          // Ignore cleanup errors
        }
      })
    ),
    Effect.asVoid
  );

const cleanupServer = (
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>
): Effect.Effect<void, never, never> =>
  pipe(Ref.get(serverStateRef), Effect.flatMap(shutdownServerResources));

const updateServerStateWithBunServer =
  (
    serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
    newConnectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
  ) =>
  (server: Bun.Server): Effect.Effect<Server.Transport, never, never> =>
    pipe(
      Ref.update(serverStateRef, (state) => ({ ...state, server })),
      Effect.as(createServerTransport(serverStateRef, newConnectionsQueue))
    );

const startWebSocketServerWithState =
  (
    config: ReadonlyDeep<WebSocketServerConfig>,
    newConnectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
  ) =>
  (
    serverStateRef: Ref.Ref<ServerState>
  ): Effect.Effect<Server.Transport, Server.ServerStartError, never> =>
    pipe(
      createWebSocketServer(config, serverStateRef),
      Effect.flatMap(updateServerStateWithBunServer(serverStateRef, newConnectionsQueue))
    );

const initializeServerStateAndStart =
  (config: ReadonlyDeep<WebSocketServerConfig>) =>
  (
    newConnectionsQueue: Queue.Queue<Server.ClientConnection>
  ): Effect.Effect<Server.Transport, Server.ServerStartError, never> =>
    pipe(
      Ref.make<ServerState>({
        server: null,
        clients: HashMap.empty(),
        newConnectionsQueue,
      }),
      Effect.flatMap(startWebSocketServerWithState(config, newConnectionsQueue))
    );

const createWebSocketServerTransport = (
  config: ReadonlyDeep<WebSocketServerConfig>
): Effect.Effect<Server.Transport, Server.ServerStartError, Scope.Scope> =>
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap(initializeServerStateAndStart(config))
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
  ): Effect.Effect<Context.Tag.Service<typeof Server.Acceptor>, never, never> =>
    Effect.succeed({
      start: () => createWebSocketServerTransport(config),
    }),
};

/**
 * WebSocket server acceptor implementation
 */
export const WebSocketAcceptor = webSocketAcceptorImpl;
