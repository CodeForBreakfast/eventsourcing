/**
 * WebSocket Server Transport Implementation
 *
 * A WebSocket server transport that implements the server contracts using Bun's WebSocket server.
 * Uses Effect.acquireRelease for proper lifecycle management and resource cleanup.
 */

import {
  Context,
  Effect,
  Stream,
  Scope,
  Ref,
  Queue,
  HashSet,
  HashMap,
  pipe,
  Schema,
  Either,
  Match,
} from 'effect';
import {
  type TransportMessage,
  ConnectionState,
  TransportError,
  Server,
  Client,
  TransportMessageSchema,
} from '@codeforbreakfast/eventsourcing-transport';
import type { ReadonlyDeep } from 'type-fest';

type ServerWebSocket<T = undefined> = Bun.ServerWebSocket<T>;

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketServerConfig {
  readonly port: number;
  readonly host: string;
  readonly authenticateConnection?: (
    req: ReadonlyDeep<Request>
  ) => Effect.Effect<Record<string, unknown>, TransportError>;
}

interface WebSocketData {
  readonly clientId: Server.ClientId;
  readonly auth?: Record<string, unknown>;
}

interface ClientState {
  readonly id: Server.ClientId;
  readonly socket: ServerWebSocket<WebSocketData>;
  readonly connectionStateRef: Ref.Ref<ConnectionState>;
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribersRef: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
  readonly connectedAt: ReadonlyDeep<Date>;
  readonly authMetadata: Record<string, unknown>;
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
      clientState.connectionStateRef,
      Ref.get,
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
      clientState.connectionStateRef,
      Ref.get,
      Effect.filterOrFail(
        (connectionState) => connectionState === 'connected',
        () =>
          new TransportError({
            message: 'Cannot publish message: client is not connected',
          })
      ),
      Effect.andThen(
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
  (msg: TransportMessage): boolean => {
    try {
      return filter(msg);
    } catch {
      return false;
    }
  };

const addQueueToClientSubscribers =
  (clientState: ReadonlyDeep<ClientState>) =>
  (queue: Queue.Queue<TransportMessage>): Effect.Effect<void, never, never> =>
    pipe(
      clientState.subscribersRef,
      Ref.update((subscribers) => HashSet.add(subscribers, queue))
    );

const subscribeToClientMessages =
  (clientState: ReadonlyDeep<ClientState>) =>
  (
    filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap(addQueueToClientSubscribers(clientState)),
      Effect.flatMap((queue) =>
        Effect.if(filter !== undefined, {
          onTrue: () =>
            Effect.succeed(Stream.filter(Stream.fromQueue(queue), applyFilterToMessage(filter!))),
          onFalse: () => Effect.succeed(Stream.fromQueue(queue)),
        })
      )
    );

const createClientTransport = (clientState: ReadonlyDeep<ClientState>): Client.Transport => ({
  connectionState: createClientConnectionStateStream(clientState),
  publish: publishMessageToClient(clientState),
  subscribe: subscribeToClientMessages(clientState),
});

// =============================================================================
// Pure Functions for Client Connection Management
// =============================================================================

const setClientConnectionStateRef = (
  clientState: ReadonlyDeep<ClientState>,
  newState: ReadonlyDeep<ConnectionState>
): Effect.Effect<void, never, never> => Ref.set(clientState.connectionStateRef, newState);

const offerToClientConnectionStateQueue = (
  clientState: ReadonlyDeep<ClientState>,
  newState: ReadonlyDeep<ConnectionState>
): Effect.Effect<void, never, never> => Queue.offer(clientState.connectionStateQueue, newState);

const updateClientConnectionState = (
  clientState: ReadonlyDeep<ClientState>,
  newState: ReadonlyDeep<ConnectionState>
): Effect.Effect<void, never, never> =>
  pipe(
    setClientConnectionStateRef(clientState, newState),
    Effect.andThen(offerToClientConnectionStateQueue(clientState, newState))
  );

const offerMessageToClientQueue =
  (message: TransportMessage) =>
  (queue: Queue.Queue<TransportMessage>): Effect.Effect<void, never, never> =>
    Queue.offer(queue, message);

const distributeMessageToSubscribers =
  (clientState: ReadonlyDeep<ClientState>) =>
  (message: TransportMessage): Effect.Effect<void, never, never> =>
    pipe(
      clientState.subscribersRef,
      Ref.get,
      Effect.flatMap((subscribers) =>
        Effect.forEach(subscribers, offerMessageToClientQueue(message), {
          discard: true,
        })
      ),
      Effect.asVoid
    );

const parseJsonString = (data: ReadonlyDeep<string>) => Effect.try(() => JSON.parse(data));

const parseClientMessageData = (data: ReadonlyDeep<string>) =>
  pipe(data, parseJsonString, Effect.flatMap(Schema.decodeUnknown(TransportMessageSchema)));

const handleClientMessage =
  (clientState: ReadonlyDeep<ClientState>) =>
  (data: ReadonlyDeep<string>): Effect.Effect<void, never, never> =>
    pipe(
      data,
      parseClientMessageData,
      Effect.flatMap(distributeMessageToSubscribers(clientState)),
      Effect.catchAll(() => Effect.void)
    );

// =============================================================================
// WebSocket Server Implementation
// =============================================================================

const createEmptySubscribersRef = (): Effect.Effect<
  Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>,
  never,
  never
> => Ref.make(HashSet.empty<Queue.Queue<TransportMessage>>());

const createClientResources = (): Effect.Effect<
  {
    readonly connectionStateQueue: Queue.Queue<ConnectionState>;
    readonly connectionStateRef: Ref.Ref<ConnectionState>;
    readonly subscribersRef: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
  },
  never,
  never
> =>
  Effect.all({
    connectionStateQueue: Queue.unbounded<ConnectionState>(),
    connectionStateRef: Ref.make<ConnectionState>('connecting'),
    subscribersRef: createEmptySubscribersRef(),
  });

const buildClientState =
  (
    clientId: Server.ClientId,
    connectedAt: ReadonlyDeep<Date>,
    ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>,
    authMetadata: Record<string, unknown>
  ) =>
  (resources: {
    readonly connectionStateQueue: Queue.Queue<ConnectionState>;
    readonly connectionStateRef: Ref.Ref<ConnectionState>;
    readonly subscribersRef: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
  }): ClientState => ({
    id: clientId,
    socket: ws,
    connectionStateRef: resources.connectionStateRef,
    connectionStateQueue: resources.connectionStateQueue,
    subscribersRef: resources.subscribersRef,
    connectedAt,
    authMetadata,
  });

const createClientStateResources = (
  clientId: Server.ClientId,
  connectedAt: ReadonlyDeep<Date>,
  ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>,
  authMetadata: Record<string, unknown>
): Effect.Effect<ClientState, never, never> =>
  pipe(
    createClientResources(),
    Effect.map(buildClientState(clientId, connectedAt, ws, authMetadata))
  );

const createAddClientToServerStateUpdater = (clientState: ClientState) => (state: ServerState) => ({
  ...state,
  clients: HashMap.set(state.clients, clientState.id, clientState),
});

const addClientToServerState = (
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
  clientState: ClientState
): Effect.Effect<void, never, never> =>
  Ref.update(serverStateRef, createAddClientToServerStateUpdater(clientState));

const offerNewConnection =
  (clientState: ClientState) =>
  (state: ServerState): Effect.Effect<void, never, never> =>
    pipe(
      state.newConnectionsQueue,
      Queue.offer({
        clientId: clientState.id,
        transport: createClientTransport(clientState),
        connectedAt: clientState.connectedAt,
        metadata: clientState.authMetadata,
      })
    );

const registerClientAndTransition =
  (
    serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
    ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>
  ) =>
  (clientState: ClientState): Effect.Effect<void, never, never> =>
    pipe(
      updateClientConnectionState(clientState, 'connecting'),
      Effect.andThen(addClientToServerState(serverStateRef, clientState)),
      Effect.andThen(
        Effect.sync(() => {
          // eslint-disable-next-line functional/immutable-data -- Bun WebSocket API requires mutating the data property to attach client metadata
          (ws as ServerWebSocket<WebSocketData>).data = {
            clientId: clientState.id,
            auth: clientState.authMetadata,
          };
        })
      ),
      Effect.andThen(updateClientConnectionState(clientState, 'connected')),
      Effect.andThen(Ref.get(serverStateRef)),
      Effect.flatMap(offerNewConnection(clientState))
    );

const handleMessageForClient =
  (message: ReadonlyDeep<string>) =>
  (clientState: ReadonlyDeep<ClientState>): Effect.Effect<void, never, never> =>
    pipe(message, handleClientMessage(clientState));

const processClientMessage = (
  state: ServerState,
  clientId: Server.ClientId,
  message: ReadonlyDeep<string>
): Effect.Effect<void, never, never> =>
  pipe(
    state.clients,
    HashMap.get(clientId),
    Effect.flatMap(handleMessageForClient(message)),
    Effect.orElse(() => Effect.void)
  );

const createRemoveClientFromServerStateUpdater =
  (clientId: Server.ClientId) => (s: ServerState) => ({
    ...s,
    clients: HashMap.remove(s.clients, clientId),
  });

const removeClientFromServerState = (
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
  clientId: Server.ClientId
): Effect.Effect<void, never, never> =>
  Ref.update(serverStateRef, createRemoveClientFromServerStateUpdater(clientId));

const disconnectClientAndCleanup =
  (serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>) =>
  (clientState: ClientState): Effect.Effect<void, never, never> =>
    pipe(
      updateClientConnectionState(clientState, 'disconnected'),
      Effect.andThen(removeClientFromServerState(serverStateRef, clientState.id))
    );

const handleClientDisconnection = (
  serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
  state: ServerState,
  clientId: Server.ClientId
): Effect.Effect<void, never, never> =>
  pipe(
    state.clients,
    HashMap.get(clientId),
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
          open: (ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>) => {
            const createClientIdAndTimestamp = (): Effect.Effect<
              { readonly clientId: Server.ClientId; readonly connectedAt: Date },
              never,
              never
            > =>
              Effect.sync(() => ({
                clientId: Server.makeClientId(`client-${Date.now()}-${Math.random()}`),
                connectedAt: new Date(),
              }));

            // eslint-disable-next-line effect/no-runSync -- WebSocket open handler is a synchronous callback at application boundary, requires Effect.runSync
            Effect.runSync(
              pipe(
                createClientIdAndTimestamp(),
                Effect.flatMap(({ clientId, connectedAt }) => {
                  const authMetadata = ws.data?.auth ?? {};
                  return createClientStateResources(clientId, connectedAt, ws, authMetadata);
                }),
                Effect.flatMap(registerClientAndTransition(serverStateRef, ws))
              )
            );
          },

          message: (
            ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>,
            message: ReadonlyDeep<string>
          ) => {
            // eslint-disable-next-line effect/no-runSync -- WebSocket message handler is a synchronous callback at application boundary, requires Effect.runSync
            Effect.runSync(
              pipe(
                serverStateRef,
                Ref.get,
                Effect.flatMap((state) => processClientMessage(state, ws.data.clientId, message))
              )
            );
          },

          close: (ws: ReadonlyDeep<ServerWebSocket<WebSocketData>>) => {
            // eslint-disable-next-line effect/no-runSync -- WebSocket close handler is a synchronous callback at application boundary, requires Effect.runSync
            Effect.runSync(
              pipe(
                serverStateRef,
                Ref.get,
                Effect.flatMap((state) =>
                  handleClientDisconnection(serverStateRef, state, ws.data.clientId)
                )
              )
            );
          },
        },

        fetch: (req, server) => {
          const handleAuthenticatedConnection = () => {
            // eslint-disable-next-line effect/no-runSync -- fetch handler is a synchronous callback at application boundary, requires Effect.runSync
            const authResult = Effect.runSync(
              pipe(
                req,
                Effect.succeed,
                Effect.flatMap(config.authenticateConnection!),
                Effect.catchAll(Effect.fail),
                Effect.either
              )
            );

            return Either.match(authResult, {
              onLeft: () => new Response('Authentication failed', { status: 401 }),
              onRight: (auth) => {
                const success = server.upgrade(req, {
                  data: { auth },
                });
                return success
                  ? undefined
                  : new Response('WebSocket upgrade failed', { status: 400 });
              },
            });
          };

          const handleUnauthenticatedConnection = () => {
            const success = server.upgrade(req);
            return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
          };

          return pipe(
            config.authenticateConnection,
            Match.value,
            Match.when(Match.undefined, handleUnauthenticatedConnection),
            Match.orElse(handleAuthenticatedConnection)
          );
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
      message,
      publishMessageToClient(clientState),
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
      serverStateRef,
      Ref.get,
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
    Effect.andThen(
      Effect.sync(() => {
        try {
          Array.from(HashMap.values(state.clients)).forEach((clientState) => {
            try {
              clientState.socket.close(1001, 'Server shutting down');
            } catch {
              // Ignore errors during cleanup
            }
          });

          state.server?.stop?.();
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
  pipe(serverStateRef, Ref.get, Effect.flatMap(shutdownServerResources));

const updateServerStateWithBunServer =
  (
    serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>,
    newConnectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
  ) =>
  (server: Bun.Server): Effect.Effect<Server.Transport, never, never> =>
    pipe(
      serverStateRef,
      Ref.update((state) => ({ ...state, server })),
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

const createServerStateRef = (
  newConnectionsQueue: Queue.Queue<Server.ClientConnection>
): Effect.Effect<Ref.Ref<ServerState>, never, never> =>
  Ref.make<ServerState>({
    server: null,
    clients: HashMap.empty(),
    newConnectionsQueue,
  });

const initializeServerStateAndStart =
  (config: ReadonlyDeep<WebSocketServerConfig>) =>
  (
    newConnectionsQueue: Queue.Queue<Server.ClientConnection>
  ): Effect.Effect<Server.Transport, Server.ServerStartError, never> =>
    pipe(
      newConnectionsQueue,
      createServerStateRef,
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
    (transport) =>
      (
        transport as Server.Transport & {
          readonly __serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>;
        }
      ).__serverStateRef
        ? cleanupServer(
            (
              transport as Server.Transport & {
                readonly __serverStateRef: ReadonlyDeep<Ref.Ref<ServerState>>;
              }
            ).__serverStateRef
          )
        : Effect.void
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
