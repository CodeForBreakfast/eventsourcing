/**
 * In-Memory Transport Implementation
 *
 * A high-performance in-memory transport that implements the transport contracts.
 * Uses Effect's Queue and Ref for direct in-memory message passing between
 * client and server instances within the same process.
 *
 * Features:
 * - Direct in-memory message passing for maximum performance
 * - Multiple clients can connect to the same server
 * - Proper connection state management with Effect's PubSub
 * - Bidirectional message flow with filtering support
 * - Resource-safe cleanup with Effect.acquireRelease
 * - Full contract compliance for testing and single-process applications
 */

import {
  Effect,
  Stream,
  Scope,
  Ref,
  Queue,
  PubSub,
  HashMap,
  HashSet,
  Option,
  pipe,
  Layer,
} from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
  Server,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// In-Memory Server Registry Service
// =============================================================================

interface InMemoryClientState {
  readonly clientToServerQueue: Queue.Queue<TransportMessage>;
  readonly serverToClientQueue: Queue.Queue<TransportMessage>;
  readonly connectionState: Ref.Ref<ConnectionState>;
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly subscribers: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
}

interface InMemoryClientConnection {
  readonly connection: Server.ClientConnection;
  readonly clientState: InMemoryClientState;
}

interface InMemoryServerRegistryEntry {
  readonly connectionsQueue: Queue.Queue<Server.ClientConnection>;
  readonly clientConnections: Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>;
}

interface InMemoryRegistryService {
  readonly findServer: (
    serverId: string
  ) => Effect.Effect<InMemoryServerRegistryEntry, ConnectionError>;
  readonly registerServer: (
    serverId: string,
    serverEntry: InMemoryServerRegistryEntry
  ) => Effect.Effect<void>;
  readonly unregisterServer: (serverId: string) => Effect.Effect<void>;
  readonly registerClientConnection: (
    serverId: string,
    clientId: string,
    clientConnection: InMemoryClientConnection
  ) => Effect.Effect<void, ConnectionError>;
  readonly unregisterClientConnection: (serverId: string, clientId: string) => Effect.Effect<void>;
}

export class InMemoryRegistry extends Effect.Tag('InMemoryRegistry')<
  InMemoryRegistry,
  InMemoryRegistryService
>() {}

const makeInMemoryRegistryService = (): Effect.Effect<InMemoryRegistryService> =>
  pipe(
    Ref.make(HashMap.empty<string, InMemoryServerRegistryEntry>()),
    Effect.map((serversRef) => ({
      findServer: (serverId: string) =>
        pipe(
          Ref.get(serversRef),
          Effect.flatMap((servers) =>
            pipe(
              HashMap.get(servers, serverId),
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new ConnectionError({
                      message: `Server not found: ${serverId}`,
                      url: `inmemory://${serverId}`,
                    })
                  ),
                onSome: (server) => Effect.succeed(server),
              })
            )
          )
        ),

      registerServer: (serverId: string, serverEntry: InMemoryServerRegistryEntry) =>
        pipe(Ref.update(serversRef, HashMap.set(serverId, serverEntry))),

      unregisterServer: (serverId: string) =>
        pipe(
          Ref.get(serversRef),
          Effect.flatMap((servers) =>
            pipe(
              HashMap.get(servers, serverId),
              Option.match({
                onNone: () => Effect.void,
                onSome: (serverEntry) =>
                  pipe(
                    disconnectAllClients(serverEntry),
                    Effect.zipRight(Ref.update(serversRef, HashMap.remove(serverId)))
                  ),
              })
            )
          )
        ),

      registerClientConnection: (
        serverId: string,
        clientId: string,
        clientConnection: InMemoryClientConnection
      ) =>
        pipe(
          Ref.get(serversRef),
          Effect.flatMap((servers) =>
            pipe(
              HashMap.get(servers, serverId),
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new ConnectionError({
                      message: `Server not found: ${serverId}`,
                      url: `inmemory://${serverId}`,
                    })
                  ),
                onSome: (server) =>
                  pipe(
                    Ref.update(server.clientConnections, HashMap.set(clientId, clientConnection))
                  ),
              })
            )
          )
        ),

      unregisterClientConnection: (serverId: string, clientId: string) =>
        pipe(
          Ref.get(serversRef),
          Effect.flatMap((servers) =>
            pipe(
              HashMap.get(servers, serverId),
              Option.match({
                onNone: () => Effect.void,
                onSome: (server) =>
                  pipe(
                    Ref.get(server.clientConnections),
                    Effect.flatMap((connections) =>
                      pipe(
                        HashMap.get(connections, clientId),
                        Option.match({
                          onNone: () => Effect.void,
                          onSome: ({ clientState }) =>
                            pipe(
                              disconnectClient(clientState),
                              Effect.zipRight(
                                Ref.update(server.clientConnections, HashMap.remove(clientId))
                              )
                            ),
                        })
                      )
                    )
                  ),
              })
            )
          )
        ),
    }))
  );

// Create a true singleton registry - this is the only way to ensure
// server and client share the same registry instance in memory
let _sharedRegistryInstance: InMemoryRegistryService | null = null;

const getSharedRegistryInstance = (): Effect.Effect<InMemoryRegistryService> =>
  Effect.sync(() => {
    if (_sharedRegistryInstance === null) {
      _sharedRegistryInstance = Effect.runSync(makeInMemoryRegistryService());
    }
    return _sharedRegistryInstance;
  });

export const InMemoryRegistryLive = Layer.effect(InMemoryRegistry, getSharedRegistryInstance());

// For testing purposes - allow resetting the registry
export const resetInMemoryRegistry = (): Effect.Effect<void> =>
  Effect.sync(() => {
    _sharedRegistryInstance = null;
  });

// =============================================================================
// Client State Helpers
// =============================================================================

const disconnectClient = (clientState: InMemoryClientState): Effect.Effect<void> =>
  pipe(
    Ref.set(clientState.connectionState, 'disconnected'),
    Effect.zipRight(PubSub.publish(clientState.connectionStatePubSub, 'disconnected'))
  );

const disconnectAllClients = (serverEntry: InMemoryServerRegistryEntry): Effect.Effect<void> =>
  pipe(
    Ref.get(serverEntry.clientConnections),
    Effect.flatMap((connections) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(({ clientState }) => disconnectClient(clientState), { discard: true })
      )
    )
  );

// =============================================================================
// Client Implementation
// =============================================================================

const createConnectionStateStream = (
  clientState: InMemoryClientState
): Stream.Stream<ConnectionState> =>
  Stream.unwrapScoped(
    pipe(
      PubSub.subscribe(clientState.connectionStatePubSub),
      Effect.flatMap((queue) =>
        pipe(
          Ref.get(clientState.connectionState),
          Effect.map((currentState) =>
            Stream.concat(Stream.succeed(currentState), Stream.fromQueue(queue))
          )
        )
      )
    )
  );

const publishWithConnectionCheck =
  (
    clientState: InMemoryClientState,
    targetQueue: Queue.Queue<TransportMessage>,
    errorMessage: string
  ) =>
  (message: TransportMessage): Effect.Effect<void, TransportError> =>
    pipe(
      Ref.get(clientState.connectionState),
      Effect.flatMap((state) =>
        state !== 'connected'
          ? Effect.fail(new TransportError({ message: errorMessage }))
          : Queue.offer(targetQueue, message)
      )
    );

const createServerSideClientTransport = (
  clientToServerQueue: Queue.Queue<TransportMessage>,
  serverToClientQueue: Queue.Queue<TransportMessage>,
  clientState: InMemoryClientState
): Client.Transport<TransportMessage> => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(clientState, serverToClientQueue, 'Client not connected'),
  subscribe: (filter?: (message: TransportMessage) => boolean) =>
    createSimpleSubscription(clientToServerQueue, filter),
});

const createSimpleSubscription = (
  sourceQueue: Queue.Queue<TransportMessage>,
  filter?: (message: TransportMessage) => boolean
): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
  pipe(
    Queue.unbounded<TransportMessage>(),
    Effect.tap((subscriberQueue) =>
      pipe(
        Stream.fromQueue(sourceQueue),
        Stream.runForEach((message) => Queue.offer(subscriberQueue, message)),
        Effect.forkDaemon
      )
    ),
    Effect.map((queue) => {
      const baseStream = Stream.fromQueue(queue);
      return filter ? Stream.filter(baseStream, filter) : baseStream;
    })
  );

const addSubscriber = (
  clientState: InMemoryClientState,
  subscriberQueue: Queue.Queue<TransportMessage>
): Effect.Effect<void> => pipe(Ref.update(clientState.subscribers, HashSet.add(subscriberQueue)));

const forwardToSubscribers = (
  clientState: InMemoryClientState,
  message: TransportMessage,
  excludeQueue?: Queue.Queue<TransportMessage>
): Effect.Effect<void> =>
  pipe(
    Ref.get(clientState.subscribers),
    Effect.flatMap((subscribers) =>
      pipe(
        HashSet.values(subscribers),
        Effect.forEach(
          (queue) => {
            if (excludeQueue && queue === excludeQueue) {
              return Effect.void;
            }
            return Queue.offer(queue, message);
          },
          { discard: true }
        )
      )
    )
  );

const setupSubscriberForwarding = (
  clientState: InMemoryClientState,
  subscriberQueue: Queue.Queue<TransportMessage>
): Effect.Effect<void> =>
  pipe(
    addSubscriber(clientState, subscriberQueue),
    Effect.zipRight(
      pipe(
        Stream.fromQueue(clientState.serverToClientQueue),
        Stream.runForEach((message) =>
          pipe(
            Queue.offer(subscriberQueue, message),
            Effect.zipRight(forwardToSubscribers(clientState, message, subscriberQueue))
          )
        ),
        Effect.forkDaemon
      )
    )
  );

const createInMemoryClientTransport = (
  clientState: InMemoryClientState
): Client.Transport<TransportMessage> => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(
    clientState,
    clientState.clientToServerQueue,
    'Not connected'
  ),
  subscribe: (
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((subscriberQueue) => setupSubscriberForwarding(clientState, subscriberQueue)),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);
        const filteredStream = filter ? Stream.filter(baseStream, filter) : baseStream;
        // The stream will be automatically cleaned up when it's no longer referenced
        return filteredStream;
      })
    ),
});

const createClientState = (
  clientToServerQueue: Queue.Queue<TransportMessage>,
  serverToClientQueue: Queue.Queue<TransportMessage>,
  connectionStatePubSub: PubSub.PubSub<ConnectionState>
): Effect.Effect<InMemoryClientState> =>
  pipe(
    Effect.all([
      Ref.make<ConnectionState>('connected'),
      Ref.make(HashSet.empty<Queue.Queue<TransportMessage>>()),
    ]),
    Effect.map(([connectionState, subscribers]) => ({
      clientToServerQueue,
      serverToClientQueue,
      connectionState,
      connectionStatePubSub,
      subscribers,
    }))
  );

const generateClientId = (): string => `client-${Date.now()}-${Math.random()}`;

const parseInMemoryUrl = (url: string): Effect.Effect<string, ConnectionError> => {
  const match = url.match(/^inmemory:\/\/(.+)$/);
  return match
    ? Effect.succeed(match[1]!)
    : Effect.fail(new ConnectionError({ message: 'Invalid URL', url }));
};

const createConnectionQueues = (): Effect.Effect<{
  connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  clientToServerQueue: Queue.Queue<TransportMessage>;
  serverToClientQueue: Queue.Queue<TransportMessage>;
}> =>
  pipe(
    Effect.all([
      PubSub.unbounded<ConnectionState>(),
      Queue.unbounded<TransportMessage>(),
      Queue.unbounded<TransportMessage>(),
    ]),
    Effect.map(([connectionStatePubSub, clientToServerQueue, serverToClientQueue]) => ({
      connectionStatePubSub,
      clientToServerQueue,
      serverToClientQueue,
    }))
  );

const createClientConnection = (
  clientId: string,
  clientToServerQueue: Queue.Queue<TransportMessage>,
  serverToClientQueue: Queue.Queue<TransportMessage>,
  clientState: InMemoryClientState
): Server.ClientConnection => ({
  clientId: Server.makeClientId(clientId),
  transport: createServerSideClientTransport(clientToServerQueue, serverToClientQueue, clientState),
  connectedAt: new Date(),
  metadata: {},
});

const setupClientConnection =
  (
    serverId: string,
    server: InMemoryServerRegistryEntry,
    clientState: InMemoryClientState,
    clientConnection: Server.ClientConnection,
    connectionStatePubSub: PubSub.PubSub<ConnectionState>
  ) =>
  (
    clientId: string
  ): Effect.Effect<
    {
      transport: Client.Transport<TransportMessage>;
      cleanup: () => Effect.Effect<void>;
    },
    ConnectionError,
    InMemoryRegistry
  > => {
    const inMemoryClientConnection: InMemoryClientConnection = {
      connection: clientConnection,
      clientState,
    };

    return pipe(
      InMemoryRegistry,
      Effect.flatMap((registry) =>
        pipe(
          registry.registerClientConnection(serverId, clientId, inMemoryClientConnection),
          Effect.zipRight(Queue.offer(server.connectionsQueue, clientConnection)),
          Effect.zipRight(PubSub.publish(connectionStatePubSub, 'connected')),
          Effect.as({
            transport: createInMemoryClientTransport(clientState),
            cleanup: () => registry.unregisterClientConnection(serverId, clientId),
          })
        )
      )
    );
  };

const inMemoryConnectRaw = (
  url: string
): Effect.Effect<
  Client.Transport<TransportMessage>,
  ConnectionError,
  Scope.Scope | InMemoryRegistry
> =>
  pipe(
    parseInMemoryUrl(url),
    Effect.flatMap((serverId) =>
      Effect.acquireRelease(
        pipe(
          InMemoryRegistry,
          Effect.flatMap((registry) => registry.findServer(serverId)),
          Effect.flatMap((server) =>
            pipe(
              createConnectionQueues(),
              Effect.flatMap(
                ({ connectionStatePubSub, clientToServerQueue, serverToClientQueue }) =>
                  pipe(
                    createClientState(
                      clientToServerQueue,
                      serverToClientQueue,
                      connectionStatePubSub
                    ),
                    Effect.flatMap((clientState) => {
                      const clientId = generateClientId();
                      const clientConnection = createClientConnection(
                        clientId,
                        clientToServerQueue,
                        serverToClientQueue,
                        clientState
                      );

                      return setupClientConnection(
                        serverId,
                        server,
                        clientState,
                        clientConnection,
                        connectionStatePubSub
                      )(clientId);
                    })
                  )
              )
            )
          )
        ),
        ({ cleanup }) => cleanup()
      ).pipe(Effect.map(({ transport }) => transport))
    )
  );

const inMemoryConnect = (
  url: string
): Effect.Effect<Client.Transport<TransportMessage>, ConnectionError, Scope.Scope> =>
  pipe(inMemoryConnectRaw(url), Effect.provide(InMemoryRegistryLive));

// =============================================================================
// Server Implementation
// =============================================================================

const createServerRegistryEntry = (
  connectionsQueue: Queue.Queue<Server.ClientConnection>
): Effect.Effect<InMemoryServerRegistryEntry> =>
  pipe(
    Ref.make(HashMap.empty<string, InMemoryClientConnection>()),
    Effect.map((clientConnections) => ({
      connectionsQueue,
      clientConnections,
    }))
  );

const broadcastToClients = (
  serverEntry: InMemoryServerRegistryEntry,
  message: TransportMessage
): Effect.Effect<void> =>
  pipe(
    Ref.get(serverEntry.clientConnections),
    Effect.flatMap((connections) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(({ clientState }) => Queue.offer(clientState.serverToClientQueue, message), {
          discard: true,
        })
      )
    )
  );

const createInMemoryServerTransport = (serverId: string) =>
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap((connectionsQueue) =>
        pipe(
          createServerRegistryEntry(connectionsQueue),
          Effect.flatMap((serverEntry) =>
            pipe(
              InMemoryRegistry,
              Effect.flatMap((registry) => registry.registerServer(serverId, serverEntry)),
              Effect.as({
                connections: Stream.fromQueue(connectionsQueue),
                broadcast: (message: TransportMessage) => broadcastToClients(serverEntry, message),
                cleanup: () =>
                  pipe(
                    InMemoryRegistry,
                    Effect.flatMap((registry) => registry.unregisterServer(serverId))
                  ),
              })
            )
          )
        )
      )
    ),
    ({ cleanup }) => cleanup()
  ).pipe(Effect.map(({ connections, broadcast }) => ({ connections, broadcast })));

// =============================================================================
// Exports
// =============================================================================

// Main exports with automatic registry layer provision
export const InMemoryConnector: Client.ConnectorInterface<TransportMessage> = {
  connect: inMemoryConnect,
};

export const InMemoryAcceptor = {
  make: (config: { serverId: string }) =>
    Effect.succeed({
      start: () =>
        pipe(createInMemoryServerTransport(config.serverId), Effect.provide(InMemoryRegistryLive)),
    }),
};

// For advanced users who want to provide their own registry layer
// Note: This requires providing InMemoryRegistryLive as a layer
export const InMemoryConnectorRaw = {
  connect: inMemoryConnectRaw,
};
