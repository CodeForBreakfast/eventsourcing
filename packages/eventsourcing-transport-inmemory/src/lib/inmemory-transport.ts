/**
 * In-Memory Transport Implementation (Pure Functional)
 *
 * A purely functional in-memory transport with zero global state and zero configuration.
 * Each server is completely isolated and returns a connector for clients.
 *
 * Features:
 * - Direct in-memory message passing for maximum performance
 * - Zero configuration - no URLs, no setup, just pure memory references
 * - Multiple isolated servers (each with their own state)
 * - Proper connection state management with Effect's PubSub
 * - Bidirectional message flow with filtering support
 * - Resource-safe cleanup with Effect.acquireRelease
 * - Full contract compliance for testing and applications
 * - Pure functional design with no global state
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
  Match,
} from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
  Server,
} from '@codeforbreakfast/eventsourcing-transport';
import type { ReadonlyDeep } from 'type-fest';

// =============================================================================
// Core Types (No Global State)
// =============================================================================

type InMemoryClientState = ReadonlyDeep<{
  readonly clientToServerQueue: Queue.Queue<TransportMessage>;
  readonly serverToClientQueue: Queue.Queue<TransportMessage>;
  readonly connectionState: Ref.Ref<ConnectionState>;
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly subscribers: Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>;
}>;

type InMemoryClientConnection = ReadonlyDeep<{
  readonly connection: Server.ClientConnection;
  readonly clientState: InMemoryClientState;
}>;

type InMemoryServerState = ReadonlyDeep<{
  readonly connectionsQueue: Queue.Queue<Server.ClientConnection>;
  readonly clientConnections: Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>;
}>;

// The connector function that clients use to connect directly to a server (no configuration needed)
export type InMemoryConnector = () => Effect.Effect<Client.Transport, ConnectionError, Scope.Scope>;

// =============================================================================
// Client State Helpers
// =============================================================================

const disconnectClient = (clientState: ReadonlyDeep<InMemoryClientState>): Effect.Effect<void> =>
  pipe(
    Ref.set(clientState.connectionState, 'disconnected'),
    Effect.zipRight(PubSub.publish(clientState.connectionStatePubSub, 'disconnected'))
  );

const disconnectAllClients = (
  serverState: ReadonlyDeep<InMemoryServerState>
): Effect.Effect<void> =>
  pipe(
    serverState.clientConnections,
    Ref.get,
    Effect.flatMap((connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
      Effect.forEach(
        HashMap.values(connections),
        ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) => disconnectClient(clientState),
        { discard: true }
      )
    )
  );

// =============================================================================
// Client Implementation
// =============================================================================

const buildConnectionStateStream =
  (clientState: ReadonlyDeep<InMemoryClientState>) =>
  (queue: ReadonlyDeep<Queue.Dequeue<ConnectionState>>) =>
    pipe(
      clientState.connectionState,
      Ref.get,
      Effect.map((currentState: ReadonlyDeep<ConnectionState>) =>
        Stream.concat(Stream.succeed(currentState), Stream.fromQueue(queue))
      )
    );

const createConnectionStateStream = (
  clientState: ReadonlyDeep<InMemoryClientState>
): ReadonlyDeep<Stream.Stream<ConnectionState>> =>
  Stream.unwrapScoped(
    pipe(
      clientState.connectionStatePubSub,
      PubSub.subscribe,
      Effect.flatMap(buildConnectionStateStream(clientState))
    )
  );

const publishOrFail =
  (
    targetQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
    errorMessage: ReadonlyDeep<string>,
    message: ReadonlyDeep<TransportMessage>
  ) =>
  (state: ReadonlyDeep<ConnectionState>): Effect.Effect<void, TransportError> =>
    Effect.if(state !== 'connected', {
      onTrue: () => Effect.fail(new TransportError({ message: errorMessage })),
      onFalse: () => Queue.offer(targetQueue, message),
    });

const publishWithConnectionCheck =
  (
    clientState: ReadonlyDeep<InMemoryClientState>,
    targetQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
    errorMessage: ReadonlyDeep<string>
  ) =>
  (message: ReadonlyDeep<TransportMessage>): Effect.Effect<void, TransportError> =>
    pipe(
      clientState.connectionState,
      Ref.get,
      Effect.flatMap(publishOrFail(targetQueue, errorMessage, message))
    );

const forwardMessagesToSubscriber =
  (sourceQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
  (subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
    pipe(
      sourceQueue,
      Stream.fromQueue,
      Stream.runForEach((message: ReadonlyDeep<TransportMessage>) =>
        Queue.offer(subscriberQueue, message)
      ),
      Effect.forkDaemon
    );

const applyFilterToStream =
  (filter?: (message: ReadonlyDeep<TransportMessage>) => boolean) =>
  (queue: ReadonlyDeep<Queue.Queue<TransportMessage>>): Stream.Stream<TransportMessage> =>
    pipe(
      filter,
      Match.value,
      Match.when(Match.undefined, () => Stream.fromQueue(queue)),
      Match.orElse((filterFn) => Stream.filter(Stream.fromQueue(queue), filterFn))
    );

const createSimpleSubscription =
  (sourceQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
  (
    filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap(forwardMessagesToSubscriber(sourceQueue)),
      Effect.map(applyFilterToStream(filter))
    );

const addSubscriber = (
  clientState: ReadonlyDeep<InMemoryClientState>,
  subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
): Effect.Effect<void> => Ref.update(clientState.subscribers, HashSet.add(subscriberQueue));

const forwardToSubscribers = (
  clientState: ReadonlyDeep<InMemoryClientState>,
  message: ReadonlyDeep<TransportMessage>,
  excludeQueue?: ReadonlyDeep<Queue.Queue<TransportMessage>>
): Effect.Effect<void> =>
  pipe(
    clientState.subscribers,
    Ref.get,
    Effect.flatMap((subscribers: ReadonlyDeep<HashSet.HashSet<Queue.Queue<TransportMessage>>>) =>
      Effect.forEach(
        HashSet.values(subscribers),
        (queue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
          excludeQueue && queue === excludeQueue ? Effect.void : Queue.offer(queue, message),
        { discard: true }
      )
    )
  );

const handleMessageForSubscriber =
  (
    clientState: ReadonlyDeep<InMemoryClientState>,
    subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
  ) =>
  (message: ReadonlyDeep<TransportMessage>) =>
    pipe(
      Queue.offer(subscriberQueue, message),
      Effect.zipRight(forwardToSubscribers(clientState, message, subscriberQueue))
    );

const startForwardingToSubscriber = (
  clientState: ReadonlyDeep<InMemoryClientState>,
  subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
) =>
  pipe(
    clientState.serverToClientQueue,
    Stream.fromQueue,
    Stream.runForEach(handleMessageForSubscriber(clientState, subscriberQueue)),
    Effect.forkDaemon
  );

const setupSubscriberForwarding =
  (clientState: ReadonlyDeep<InMemoryClientState>) =>
  (subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>): Effect.Effect<void> =>
    pipe(
      addSubscriber(clientState, subscriberQueue),
      Effect.zipRight(startForwardingToSubscriber(clientState, subscriberQueue))
    );

const createServerSideClientTransport = (
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  clientState: ReadonlyDeep<InMemoryClientState>
): Client.Transport => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(clientState, serverToClientQueue, 'Client not connected'),
  subscribe: createSimpleSubscription(clientToServerQueue),
});

const createClientTransport = (
  clientState: ReadonlyDeep<InMemoryClientState>
): Client.Transport => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(
    clientState,
    clientState.clientToServerQueue,
    'Not connected'
  ),
  subscribe: (
    filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap(setupSubscriberForwarding(clientState)),
      Effect.map(applyFilterToStream(filter))
    ),
});

// =============================================================================
// Pure Functional Helpers
// =============================================================================

const createClientState = (
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  connectionStatePubSub: ReadonlyDeep<PubSub.PubSub<ConnectionState>>
): Effect.Effect<InMemoryClientState> =>
  pipe(
    [
      Ref.make<ConnectionState>('connected'),
      Ref.make(HashSet.empty<Queue.Queue<TransportMessage>>()),
    ] as const,
    Effect.all,
    Effect.map(
      ([connectionState, subscribers]: readonly [
        ReadonlyDeep<Ref.Ref<ConnectionState>>,
        ReadonlyDeep<Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>>,
      ]) => ({
        clientToServerQueue,
        serverToClientQueue,
        connectionState,
        connectionStatePubSub,
        subscribers,
      })
    )
  );

const generateClientId = (): string => `client-${crypto.randomUUID()}`;

const createConnectionQueues = (): Effect.Effect<{
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly clientToServerQueue: Queue.Queue<TransportMessage>;
  readonly serverToClientQueue: Queue.Queue<TransportMessage>;
}> =>
  pipe(
    [
      PubSub.unbounded<ConnectionState>(),
      Queue.unbounded<TransportMessage>(),
      Queue.unbounded<TransportMessage>(),
    ] as const,
    Effect.all,
    Effect.map(
      ([connectionStatePubSub, clientToServerQueue, serverToClientQueue]: readonly [
        ReadonlyDeep<PubSub.PubSub<ConnectionState>>,
        ReadonlyDeep<Queue.Queue<TransportMessage>>,
        ReadonlyDeep<Queue.Queue<TransportMessage>>,
      ]) => ({
        connectionStatePubSub,
        clientToServerQueue,
        serverToClientQueue,
      })
    )
  );

const createClientConnection = (
  clientId: ReadonlyDeep<string>,
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  clientState: ReadonlyDeep<InMemoryClientState>
): Server.ClientConnection => ({
  clientId: Server.makeClientId(clientId),
  transport: createServerSideClientTransport(clientToServerQueue, serverToClientQueue, clientState),
  connectedAt: new Date(),
  metadata: {},
});

// =============================================================================
// Server Implementation (Pure Functional)
// =============================================================================

const createServerState = (
  connectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
): Effect.Effect<InMemoryServerState> =>
  pipe(
    HashMap.empty<string, InMemoryClientConnection>(),
    Ref.make,
    Effect.map(
      (
        clientConnections: ReadonlyDeep<Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>>
      ) => ({
        connectionsQueue,
        clientConnections,
      })
    )
  );

const broadcastToClients =
  (serverState: ReadonlyDeep<InMemoryServerState>) =>
  (message: ReadonlyDeep<TransportMessage>): Effect.Effect<void> =>
    pipe(
      serverState.clientConnections,
      Ref.get,
      Effect.flatMap(
        (connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
          Effect.forEach(
            HashMap.values(connections),
            ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) =>
              Queue.offer(clientState.serverToClientQueue, message),
            {
              discard: true,
            }
          )
      )
    );

const registerClientConnection = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientId: ReadonlyDeep<string>,
  clientConnection: ReadonlyDeep<InMemoryClientConnection>
): Effect.Effect<void> =>
  Ref.update(serverState.clientConnections, HashMap.set(clientId, clientConnection));

const disconnectAndRemoveClient = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientId: ReadonlyDeep<string>,
  clientState: ReadonlyDeep<InMemoryClientState>
) =>
  pipe(
    clientState,
    disconnectClient,
    Effect.zipRight(Ref.update(serverState.clientConnections, HashMap.remove(clientId)))
  );

const unregisterClientConnection = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientId: ReadonlyDeep<string>
): Effect.Effect<void> =>
  pipe(
    serverState.clientConnections,
    Ref.get,
    Effect.flatMap((connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
      Option.match(HashMap.get(connections, clientId), {
        onNone: () => Effect.void,
        onSome: ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) =>
          disconnectAndRemoveClient(serverState, clientId, clientState),
      })
    )
  );

const setupClientConnection = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientState: ReadonlyDeep<InMemoryClientState>,
  clientConnection: ReadonlyDeep<Server.ClientConnection>,
  connectionStatePubSub: ReadonlyDeep<PubSub.PubSub<ConnectionState>>,
  clientId: ReadonlyDeep<string>
): Effect.Effect<{
  readonly transport: Client.Transport;
  readonly cleanup: () => Effect.Effect<void>;
}> => {
  const inMemoryClientConnection: InMemoryClientConnection = {
    connection: clientConnection,
    clientState,
  };

  return pipe(
    registerClientConnection(serverState, clientId, inMemoryClientConnection),
    Effect.zipRight(Queue.offer(serverState.connectionsQueue, clientConnection)),
    Effect.zipRight(PubSub.publish(connectionStatePubSub, 'connected')),
    Effect.as({
      transport: createClientTransport(clientState),
      cleanup: () => unregisterClientConnection(serverState, clientId),
    })
  );
};

const addCleanupFinalizer = (transport: Client.Transport, cleanup: () => Effect.Effect<void>) =>
  pipe(
    Effect.void,
    Effect.tap(() => Effect.addFinalizer(cleanup)),
    Effect.as(transport)
  );

const connectClientToServer =
  (
    serverState: ReadonlyDeep<InMemoryServerState>,
    connectionStatePubSub: ReadonlyDeep<PubSub.PubSub<ConnectionState>>,
    clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
    serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
  ) =>
  (clientState: ReadonlyDeep<InMemoryClientState>) => {
    const clientId = generateClientId();
    const clientConnection = createClientConnection(
      clientId,
      clientToServerQueue,
      serverToClientQueue,
      clientState
    );

    return pipe(
      setupClientConnection(
        serverState,
        clientState,
        clientConnection,
        connectionStatePubSub,
        clientId
      ),
      Effect.flatMap(({ transport, cleanup }) => addCleanupFinalizer(transport, cleanup))
    );
  };

const buildClientStateAndConnect = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  connectionStatePubSub: ReadonlyDeep<PubSub.PubSub<ConnectionState>>,
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
) =>
  pipe(
    createClientState(clientToServerQueue, serverToClientQueue, connectionStatePubSub),
    Effect.flatMap(
      connectClientToServer(
        serverState,
        connectionStatePubSub,
        clientToServerQueue,
        serverToClientQueue
      )
    )
  );

const createConnectorForServer =
  (serverState: ReadonlyDeep<InMemoryServerState>): InMemoryConnector =>
  () =>
    pipe(
      createConnectionQueues(),
      Effect.flatMap(
        ({
          connectionStatePubSub,
          clientToServerQueue,
          serverToClientQueue,
        }: ReadonlyDeep<{
          readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
          readonly clientToServerQueue: Queue.Queue<TransportMessage>;
          readonly serverToClientQueue: Queue.Queue<TransportMessage>;
        }>) =>
          buildClientStateAndConnect(
            serverState,
            connectionStatePubSub,
            clientToServerQueue,
            serverToClientQueue
          )
      )
    );

const buildServerTransportWithFinalizer =
  (connectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>) =>
  (serverState: ReadonlyDeep<InMemoryServerState>) =>
    pipe(
      Effect.void,
      Effect.tap(() => Effect.addFinalizer(() => disconnectAllClients(serverState))),
      Effect.as({
        connections: Stream.fromQueue(connectionsQueue),
        broadcast: broadcastToClients(serverState),
        connector: createConnectorForServer(serverState),
      })
    );

const buildServerStateAndTransport = (
  connectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>
) =>
  pipe(
    connectionsQueue,
    createServerState,
    Effect.flatMap(buildServerTransportWithFinalizer(connectionsQueue))
  );

const createInMemoryServerTransport = (): Effect.Effect<
  {
    readonly connections: Stream.Stream<Server.ClientConnection>;
    readonly broadcast: (message: ReadonlyDeep<TransportMessage>) => Effect.Effect<void>;
    readonly connector: InMemoryConnector;
  },
  never,
  Scope.Scope
> => pipe(Queue.unbounded<Server.ClientConnection>(), Effect.flatMap(buildServerStateAndTransport));

// =============================================================================
// Exports (Pure Functional Interface)
// =============================================================================

export type InMemoryServer = ReadonlyDeep<{
  readonly connections: Stream.Stream<Server.ClientConnection>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void>;
  readonly connector: InMemoryConnector;
}>;

export const InMemoryAcceptor = {
  make: (): Effect.Effect<{
    readonly start: () => Effect.Effect<InMemoryServer, never, Scope.Scope>;
  }> =>
    Effect.succeed({
      start: createInMemoryServerTransport,
    }),
};
