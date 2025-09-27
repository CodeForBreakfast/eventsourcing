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

import { Effect, Stream, Scope, Ref, Queue, PubSub, HashMap, HashSet, Option, pipe } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
  Server,
} from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Core Types (No Global State)
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

interface InMemoryServerState {
  readonly connectionsQueue: Queue.Queue<Server.ClientConnection>;
  readonly clientConnections: Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>;
}

// The connector function that clients use to connect directly to a server (no configuration needed)
export type InMemoryConnector = () => Effect.Effect<Client.Transport, ConnectionError, Scope.Scope>;

// =============================================================================
// Client State Helpers
// =============================================================================

const disconnectClient = (clientState: InMemoryClientState): Effect.Effect<void> =>
  pipe(
    Ref.set(clientState.connectionState, 'disconnected'),
    Effect.zipRight(PubSub.publish(clientState.connectionStatePubSub, 'disconnected'))
  );

const disconnectAllClients = (serverState: InMemoryServerState): Effect.Effect<void> =>
  pipe(
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: HashMap.HashMap<string, InMemoryClientConnection>) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(
          ({ clientState }: InMemoryClientConnection) => disconnectClient(clientState),
          { discard: true }
        )
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
      Effect.flatMap((queue: Queue.Dequeue<ConnectionState>) =>
        pipe(
          Ref.get(clientState.connectionState),
          Effect.map((currentState: ConnectionState) =>
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
      Effect.flatMap((state: ConnectionState) =>
        state !== 'connected'
          ? Effect.fail(new TransportError({ message: errorMessage }))
          : Queue.offer(targetQueue, message)
      )
    );

const createSimpleSubscription = (
  sourceQueue: Queue.Queue<TransportMessage>,
  filter?: (message: TransportMessage) => boolean
): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
  pipe(
    Queue.unbounded<TransportMessage>(),
    Effect.tap((subscriberQueue: Queue.Queue<TransportMessage>) =>
      pipe(
        Stream.fromQueue(sourceQueue),
        Stream.runForEach((message: TransportMessage) => Queue.offer(subscriberQueue, message)),
        Effect.forkDaemon
      )
    ),
    Effect.map((queue: Queue.Queue<TransportMessage>) => {
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
    Effect.flatMap((subscribers: HashSet.HashSet<Queue.Queue<TransportMessage>>) =>
      pipe(
        HashSet.values(subscribers),
        Effect.forEach(
          (queue: Queue.Queue<TransportMessage>) => {
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
        Stream.runForEach((message: TransportMessage) =>
          pipe(
            Queue.offer(subscriberQueue, message),
            Effect.zipRight(forwardToSubscribers(clientState, message, subscriberQueue))
          )
        ),
        Effect.forkDaemon
      )
    )
  );

const createServerSideClientTransport = (
  clientToServerQueue: Queue.Queue<TransportMessage>,
  serverToClientQueue: Queue.Queue<TransportMessage>,
  clientState: InMemoryClientState
): Client.Transport => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(clientState, serverToClientQueue, 'Client not connected'),
  subscribe: (filter?: (message: TransportMessage) => boolean) =>
    createSimpleSubscription(clientToServerQueue, filter),
});

const createClientTransport = (clientState: InMemoryClientState): Client.Transport => ({
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
      Effect.tap((subscriberQueue: Queue.Queue<TransportMessage>) =>
        setupSubscriberForwarding(clientState, subscriberQueue)
      ),
      Effect.map((queue: Queue.Queue<TransportMessage>) => {
        const baseStream = Stream.fromQueue(queue);
        const filteredStream = filter ? Stream.filter(baseStream, filter) : baseStream;
        return filteredStream;
      })
    ),
});

// =============================================================================
// Pure Functional Helpers
// =============================================================================

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
    Effect.map(
      ([connectionState, subscribers]: [
        Ref.Ref<ConnectionState>,
        Ref.Ref<HashSet.HashSet<Queue.Queue<TransportMessage>>>,
      ]) => ({
        clientToServerQueue,
        serverToClientQueue,
        connectionState,
        connectionStatePubSub,
        subscribers,
      })
    )
  );

const generateClientId = (): string => `client-${Date.now()}-${Math.random()}`;

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
    Effect.map(
      ([connectionStatePubSub, clientToServerQueue, serverToClientQueue]: [
        PubSub.PubSub<ConnectionState>,
        Queue.Queue<TransportMessage>,
        Queue.Queue<TransportMessage>,
      ]) => ({
        connectionStatePubSub,
        clientToServerQueue,
        serverToClientQueue,
      })
    )
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

// =============================================================================
// Server Implementation (Pure Functional)
// =============================================================================

const createServerState = (
  connectionsQueue: Queue.Queue<Server.ClientConnection>
): Effect.Effect<InMemoryServerState> =>
  pipe(
    Ref.make(HashMap.empty<string, InMemoryClientConnection>()),
    Effect.map((clientConnections: Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>) => ({
      connectionsQueue,
      clientConnections,
    }))
  );

const broadcastToClients = (
  serverState: InMemoryServerState,
  message: TransportMessage
): Effect.Effect<void> =>
  pipe(
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: HashMap.HashMap<string, InMemoryClientConnection>) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(
          ({ clientState }: InMemoryClientConnection) =>
            Queue.offer(clientState.serverToClientQueue, message),
          {
            discard: true,
          }
        )
      )
    )
  );

const registerClientConnection = (
  serverState: InMemoryServerState,
  clientId: string,
  clientConnection: InMemoryClientConnection
): Effect.Effect<void> =>
  pipe(Ref.update(serverState.clientConnections, HashMap.set(clientId, clientConnection)));

const unregisterClientConnection = (
  serverState: InMemoryServerState,
  clientId: string
): Effect.Effect<void> =>
  pipe(
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: HashMap.HashMap<string, InMemoryClientConnection>) =>
      pipe(
        HashMap.get(connections, clientId),
        Option.match({
          onNone: () => Effect.void,
          onSome: ({ clientState }: InMemoryClientConnection) =>
            pipe(
              disconnectClient(clientState),
              Effect.zipRight(Ref.update(serverState.clientConnections, HashMap.remove(clientId)))
            ),
        })
      )
    )
  );

const setupClientConnection = (
  serverState: InMemoryServerState,
  clientState: InMemoryClientState,
  clientConnection: Server.ClientConnection,
  connectionStatePubSub: PubSub.PubSub<ConnectionState>,
  clientId: string
): Effect.Effect<{
  transport: Client.Transport;
  cleanup: () => Effect.Effect<void>;
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

const createConnectorForServer =
  (serverState: InMemoryServerState): InMemoryConnector =>
  () =>
    pipe(
      createConnectionQueues(),
      Effect.flatMap(
        ({
          connectionStatePubSub,
          clientToServerQueue,
          serverToClientQueue,
        }: {
          connectionStatePubSub: PubSub.PubSub<ConnectionState>;
          clientToServerQueue: Queue.Queue<TransportMessage>;
          serverToClientQueue: Queue.Queue<TransportMessage>;
        }) =>
          pipe(
            createClientState(clientToServerQueue, serverToClientQueue, connectionStatePubSub),
            Effect.flatMap((clientState: InMemoryClientState) => {
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
                Effect.flatMap(({ transport, cleanup }) =>
                  pipe(
                    Effect.addFinalizer(() => cleanup()),
                    Effect.as(transport)
                  )
                )
              );
            })
          )
      )
    );

const createInMemoryServerTransport = (): Effect.Effect<
  {
    connections: Stream.Stream<Server.ClientConnection>;
    broadcast: (message: TransportMessage) => Effect.Effect<void>;
    connector: InMemoryConnector;
  },
  never,
  Scope.Scope
> =>
  pipe(
    Queue.unbounded<Server.ClientConnection>(),
    Effect.flatMap((connectionsQueue: Queue.Queue<Server.ClientConnection>) =>
      pipe(
        createServerState(connectionsQueue),
        Effect.flatMap((serverState: InMemoryServerState) =>
          pipe(
            Effect.addFinalizer(() => disconnectAllClients(serverState)),
            Effect.as({
              connections: Stream.fromQueue(connectionsQueue),
              broadcast: (message: TransportMessage) => broadcastToClients(serverState, message),
              connector: createConnectorForServer(serverState),
            })
          )
        )
      )
    )
  );

// =============================================================================
// Exports (Pure Functional Interface)
// =============================================================================

export interface InMemoryServer {
  readonly connections: Stream.Stream<Server.ClientConnection>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void>;
  readonly connector: InMemoryConnector;
}

export const InMemoryAcceptor = {
  make: (): Effect.Effect<{
    start: () => Effect.Effect<InMemoryServer, never, Scope.Scope>;
  }> =>
    Effect.succeed({
      start: () => createInMemoryServerTransport(),
    }),
};
