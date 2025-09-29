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
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(
          ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) =>
            disconnectClient(clientState),
          { discard: true }
        )
      )
    )
  );

// =============================================================================
// Client Implementation
// =============================================================================

const createConnectionStateStream = (
  clientState: ReadonlyDeep<InMemoryClientState>
): ReadonlyDeep<Stream.Stream<ConnectionState>> =>
  Stream.unwrapScoped(
    pipe(
      PubSub.subscribe(clientState.connectionStatePubSub),
      Effect.flatMap((queue: ReadonlyDeep<Queue.Dequeue<ConnectionState>>) =>
        pipe(
          Ref.get(clientState.connectionState),
          Effect.map((currentState: ReadonlyDeep<ConnectionState>) =>
            Stream.concat(Stream.succeed(currentState), Stream.fromQueue(queue))
          )
        )
      )
    )
  );

const publishWithConnectionCheck =
  (
    clientState: ReadonlyDeep<InMemoryClientState>,
    targetQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
    errorMessage: ReadonlyDeep<string>
  ) =>
  (message: ReadonlyDeep<TransportMessage>): Effect.Effect<void, TransportError> =>
    pipe(
      Ref.get(clientState.connectionState),
      Effect.flatMap((state: ReadonlyDeep<ConnectionState>) =>
        state !== 'connected'
          ? Effect.fail(new TransportError({ message: errorMessage }))
          : Queue.offer(targetQueue, message)
      )
    );

const createSimpleSubscription = (
  sourceQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  filter?: (message: ReadonlyDeep<TransportMessage>) => boolean
): Effect.Effect<Stream.Stream<TransportMessage>, TransportError, never> =>
  pipe(
    Queue.unbounded<TransportMessage>(),
    Effect.tap((subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
      pipe(
        Stream.fromQueue(sourceQueue),
        Stream.runForEach((message: ReadonlyDeep<TransportMessage>) =>
          Queue.offer(subscriberQueue, message)
        ),
        Effect.forkDaemon
      )
    ),
    Effect.map((queue: ReadonlyDeep<Queue.Queue<TransportMessage>>) => {
      const baseStream = Stream.fromQueue(queue);
      return filter ? Stream.filter(baseStream, filter) : baseStream;
    })
  );

const addSubscriber = (
  clientState: ReadonlyDeep<InMemoryClientState>,
  subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
): Effect.Effect<void> => pipe(Ref.update(clientState.subscribers, HashSet.add(subscriberQueue)));

const forwardToSubscribers = (
  clientState: ReadonlyDeep<InMemoryClientState>,
  message: ReadonlyDeep<TransportMessage>,
  excludeQueue?: ReadonlyDeep<Queue.Queue<TransportMessage>>
): Effect.Effect<void> =>
  pipe(
    Ref.get(clientState.subscribers),
    Effect.flatMap((subscribers: ReadonlyDeep<HashSet.HashSet<Queue.Queue<TransportMessage>>>) =>
      pipe(
        HashSet.values(subscribers),
        Effect.forEach(
          (queue: ReadonlyDeep<Queue.Queue<TransportMessage>>) => {
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
  clientState: ReadonlyDeep<InMemoryClientState>,
  subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>
): Effect.Effect<void> =>
  pipe(
    addSubscriber(clientState, subscriberQueue),
    Effect.zipRight(
      pipe(
        Stream.fromQueue(clientState.serverToClientQueue),
        Stream.runForEach((message: ReadonlyDeep<TransportMessage>) =>
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
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  clientState: ReadonlyDeep<InMemoryClientState>
): Client.Transport => ({
  connectionState: createConnectionStateStream(clientState),
  publish: publishWithConnectionCheck(clientState, serverToClientQueue, 'Client not connected'),
  subscribe: (filter?: (message: ReadonlyDeep<TransportMessage>) => boolean) =>
    createSimpleSubscription(clientToServerQueue, filter),
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
      Effect.tap((subscriberQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>) =>
        setupSubscriberForwarding(clientState, subscriberQueue)
      ),
      Effect.map((queue: ReadonlyDeep<Queue.Queue<TransportMessage>>) => {
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
  clientToServerQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  serverToClientQueue: ReadonlyDeep<Queue.Queue<TransportMessage>>,
  connectionStatePubSub: ReadonlyDeep<PubSub.PubSub<ConnectionState>>
): Effect.Effect<InMemoryClientState> =>
  pipe(
    Effect.all([
      Ref.make<ConnectionState>('connected'),
      Ref.make(HashSet.empty<Queue.Queue<TransportMessage>>()),
    ]),
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

const generateClientId = (): string => `client-${Date.now()}-${Math.random()}`;

const createConnectionQueues = (): Effect.Effect<{
  readonly connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  readonly clientToServerQueue: Queue.Queue<TransportMessage>;
  readonly serverToClientQueue: Queue.Queue<TransportMessage>;
}> =>
  pipe(
    Effect.all([
      PubSub.unbounded<ConnectionState>(),
      Queue.unbounded<TransportMessage>(),
      Queue.unbounded<TransportMessage>(),
    ]),
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
    Ref.make(HashMap.empty<string, InMemoryClientConnection>()),
    Effect.map(
      (
        clientConnections: ReadonlyDeep<Ref.Ref<HashMap.HashMap<string, InMemoryClientConnection>>>
      ) => ({
        connectionsQueue,
        clientConnections,
      })
    )
  );

const broadcastToClients = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  message: ReadonlyDeep<TransportMessage>
): Effect.Effect<void> =>
  pipe(
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
      pipe(
        HashMap.values(connections),
        Effect.forEach(
          ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) =>
            Queue.offer(clientState.serverToClientQueue, message),
          {
            discard: true,
          }
        )
      )
    )
  );

const registerClientConnection = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientId: ReadonlyDeep<string>,
  clientConnection: ReadonlyDeep<InMemoryClientConnection>
): Effect.Effect<void> =>
  pipe(Ref.update(serverState.clientConnections, HashMap.set(clientId, clientConnection)));

const unregisterClientConnection = (
  serverState: ReadonlyDeep<InMemoryServerState>,
  clientId: ReadonlyDeep<string>
): Effect.Effect<void> =>
  pipe(
    Ref.get(serverState.clientConnections),
    Effect.flatMap((connections: ReadonlyDeep<HashMap.HashMap<string, InMemoryClientConnection>>) =>
      pipe(
        HashMap.get(connections, clientId),
        Option.match({
          onNone: () => Effect.void,
          onSome: ({ clientState }: ReadonlyDeep<InMemoryClientConnection>) =>
            pipe(
              disconnectClient(clientState),
              Effect.zipRight(Ref.update(serverState.clientConnections, HashMap.remove(clientId)))
            ),
        })
      )
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
          pipe(
            createClientState(clientToServerQueue, serverToClientQueue, connectionStatePubSub),
            Effect.flatMap((clientState: ReadonlyDeep<InMemoryClientState>) => {
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
    readonly connections: Stream.Stream<Server.ClientConnection>;
    readonly broadcast: (message: ReadonlyDeep<TransportMessage>) => Effect.Effect<void>;
    readonly connector: InMemoryConnector;
  },
  never,
  Scope.Scope
> =>
  pipe(
    Queue.unbounded<Server.ClientConnection>(),
    Effect.flatMap((connectionsQueue: ReadonlyDeep<Queue.Queue<Server.ClientConnection>>) =>
      pipe(
        createServerState(connectionsQueue),
        Effect.flatMap((serverState: ReadonlyDeep<InMemoryServerState>) =>
          pipe(
            Effect.addFinalizer(() => disconnectAllClients(serverState)),
            Effect.as({
              connections: Stream.fromQueue(connectionsQueue),
              broadcast: (message: ReadonlyDeep<TransportMessage>) =>
                broadcastToClients(serverState, message),
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
      start: () => createInMemoryServerTransport(),
    }),
};
