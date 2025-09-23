/**
 * In-Memory Transport Implementation (Pure Functional)
 *
 * A purely functional in-memory transport with zero global state.
 * Each server is completely isolated and returns a connector for clients.
 *
 * Features:
 * - Direct in-memory message passing for maximum performance
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
} from '@codeforbreakfast/eventsourcing-transport-contracts';

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

// The connector function that clients use to connect to a specific server
export type InMemoryConnector = (
  url: string
) => Effect.Effect<Client.Transport<TransportMessage>, ConnectionError, Scope.Scope>;

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

const createClientTransport = (
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
    Effect.map(([connectionState, subscribers]) => ({
      clientToServerQueue,
      serverToClientQueue,
      connectionState,
      connectionStatePubSub,
      subscribers,
    }))
  );

const generateClientId = (): string => `client-${Date.now()}-${Math.random()}`;

const parseInMemoryUrl = (url: string): Effect.Effect<void, ConnectionError> => {
  const match = url.match(/^inmemory:\/\//);
  return match ? Effect.void : Effect.fail(new ConnectionError({ message: 'Invalid URL', url }));
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

// =============================================================================
// Server Implementation (Pure Functional)
// =============================================================================

const createServerState = (
  connectionsQueue: Queue.Queue<Server.ClientConnection>
): Effect.Effect<InMemoryServerState> =>
  pipe(
    Ref.make(HashMap.empty<string, InMemoryClientConnection>()),
    Effect.map((clientConnections) => ({
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
    Effect.flatMap((connections) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(({ clientState }) => Queue.offer(clientState.serverToClientQueue, message), {
          discard: true,
        })
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
    Effect.flatMap((connections) =>
      pipe(
        HashMap.get(connections, clientId),
        Option.match({
          onNone: () => Effect.void,
          onSome: ({ clientState }) =>
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
  transport: Client.Transport<TransportMessage>;
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
  (url: string) =>
    pipe(
      parseInMemoryUrl(url),
      Effect.flatMap(() =>
        Effect.acquireRelease(
          pipe(
            createConnectionQueues(),
            Effect.flatMap(({ connectionStatePubSub, clientToServerQueue, serverToClientQueue }) =>
              pipe(
                createClientState(clientToServerQueue, serverToClientQueue, connectionStatePubSub),
                Effect.flatMap((clientState) => {
                  const clientId = generateClientId();
                  const clientConnection = createClientConnection(
                    clientId,
                    clientToServerQueue,
                    serverToClientQueue,
                    clientState
                  );

                  return setupClientConnection(
                    serverState,
                    clientState,
                    clientConnection,
                    connectionStatePubSub,
                    clientId
                  );
                })
              )
            )
          ),
          ({ cleanup }) => cleanup()
        ).pipe(Effect.map(({ transport }) => transport))
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
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap((connectionsQueue) =>
        pipe(
          createServerState(connectionsQueue),
          Effect.map((serverState) => ({
            connections: Stream.fromQueue(connectionsQueue),
            broadcast: (message: TransportMessage) => broadcastToClients(serverState, message),
            connector: createConnectorForServer(serverState),
            cleanup: () => disconnectAllClients(serverState),
          }))
        )
      )
    ),
    ({ cleanup }) => cleanup()
  ).pipe(
    Effect.map(({ connections, broadcast, connector }) => ({ connections, broadcast, connector }))
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

// Legacy interface for backwards compatibility (will be removed)
export const InMemoryConnector: Client.ConnectorInterface<TransportMessage> = {
  connect: () =>
    Effect.fail(
      new ConnectionError({
        message:
          'InMemoryConnector is deprecated. Use the connector returned by InMemoryAcceptor.make().start()',
        url: 'inmemory://',
      })
    ),
};
