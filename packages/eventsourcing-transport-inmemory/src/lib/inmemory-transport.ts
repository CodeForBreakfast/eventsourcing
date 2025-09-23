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

import { Effect, Stream, Scope, Ref, Queue, PubSub, pipe } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  Client,
  Server,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// In-Memory Server Registry
// =============================================================================

interface InMemoryClientState {
  clientToServerQueue: Queue.Queue<TransportMessage>; // Messages from this client to server
  serverToClientQueue: Queue.Queue<TransportMessage>; // Messages from server to this client
  connectionState: ConnectionState;
  connectionStatePubSub: PubSub.PubSub<ConnectionState>;
  subscribers: Set<Queue.Queue<TransportMessage>>; // Client-side subscribers
}

interface InMemoryServerRegistryEntry {
  connectionsQueue: Queue.Queue<Server.ClientConnection>;
  clientConnections: Map<
    string,
    {
      connection: Server.ClientConnection;
      clientState: InMemoryClientState;
    }
  >;
}

const inMemoryRegistry = new Map<string, InMemoryServerRegistryEntry>();

// =============================================================================
// Client Implementation
// =============================================================================

const createServerSideClientTransport = (
  clientToServerQueue: Queue.Queue<TransportMessage>,
  serverToClientQueue: Queue.Queue<TransportMessage>
): Client.Transport<TransportMessage> => ({
  // Server-side connection is always considered connected
  connectionState: Stream.succeed('connected' as ConnectionState),

  // Publishing from server-side sends to the client
  publish: (message: TransportMessage) => Queue.offer(serverToClientQueue, message),

  // Subscribing from server-side listens to messages from the client
  subscribe: (filter?: (message: TransportMessage) => boolean) =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((subscriberQueue) => {
        // Start a background task to forward messages from clientToServerQueue to this subscriber
        const forwardMessages = Effect.gen(function* () {
          while (true) {
            const message = yield* Queue.take(clientToServerQueue);
            yield* Queue.offer(subscriberQueue, message);
          }
        });
        Effect.runFork(forwardMessages);
      }),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);
        return filter ? Stream.filter(baseStream, filter) : baseStream;
      })
    ),
});

const createInMemoryClientTransport = (
  clientState: InMemoryClientState
): Client.Transport<TransportMessage> => ({
  connectionState: Stream.unwrapScoped(
    pipe(
      Effect.succeed(clientState),
      Effect.flatMap((state) =>
        pipe(
          PubSub.subscribe(state.connectionStatePubSub),
          Effect.map((queue) =>
            Stream.concat(Stream.succeed(state.connectionState), Stream.fromQueue(queue))
          )
        )
      ),
      Effect.orDie
    )
  ),

  publish: (message: TransportMessage) => {
    if (clientState.connectionState !== 'connected') {
      return Effect.fail(new TransportError({ message: 'Not connected' }));
    }
    return Queue.offer(clientState.clientToServerQueue, message);
  },

  subscribe: (filter?: (message: TransportMessage) => boolean) =>
    pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((subscriberQueue) => {
        clientState.subscribers.add(subscriberQueue);

        // Start a background task to forward messages from serverToClientQueue to this subscriber
        const forwardMessages = Effect.gen(function* () {
          while (true) {
            const message = yield* Queue.take(clientState.serverToClientQueue);
            yield* Queue.offer(subscriberQueue, message);
            // Also forward to other subscribers of this client
            yield* Effect.forEach(
              Array.from(clientState.subscribers).filter((q) => q !== subscriberQueue),
              (queue) => Queue.offer(queue, message),
              { discard: true }
            );
          }
        });
        Effect.runFork(forwardMessages);
      }),
      Effect.map((queue) => {
        const baseStream = Stream.fromQueue(queue);
        return filter ? Stream.filter(baseStream, filter) : baseStream;
      })
    ),
});

const inMemoryConnect = (
  url: string
): Effect.Effect<Client.Transport<TransportMessage>, ConnectionError, Scope.Scope> => {
  const match = url.match(/^inmemory:\/\/(.+)$/);
  if (!match) {
    return Effect.fail(new ConnectionError({ message: 'Invalid URL', url }));
  }

  const serverId = match[1]!;

  return Effect.acquireRelease(
    pipe(
      Effect.all([
        PubSub.unbounded<ConnectionState>(),
        Queue.unbounded<TransportMessage>(), // clientToServerQueue
        Queue.unbounded<TransportMessage>(), // serverToClientQueue
      ]),
      Effect.flatMap(([connectionStatePubSub, clientToServerQueue, serverToClientQueue]) =>
        pipe(
          Effect.sync(() => {
            const server = inMemoryRegistry.get(serverId);
            if (!server) {
              return null;
            }
            return server;
          }),
          Effect.flatMap((server) => {
            if (!server) {
              return Effect.fail(
                new ConnectionError({ message: `Server not found: ${serverId}`, url })
              );
            }
            return Effect.succeed(server);
          }),
          Effect.flatMap((server) => {
            const clientState: InMemoryClientState = {
              clientToServerQueue,
              serverToClientQueue,
              connectionState: 'connected',
              connectionStatePubSub,
              subscribers: new Set(),
            };

            return pipe(
              Effect.sync(() => {
                const clientId = `client-${Date.now()}-${Math.random()}`;

                // Create server-side view of the client connection
                const serverSideTransport = createServerSideClientTransport(
                  clientToServerQueue,
                  serverToClientQueue
                );

                const clientConnection: Server.ClientConnection = {
                  clientId: Server.makeClientId(clientId),
                  transport: serverSideTransport,
                  connectedAt: new Date(),
                  metadata: {},
                };

                // Register the client connection
                server.clientConnections.set(clientId, {
                  connection: clientConnection,
                  clientState,
                });

                // Notify about new connection
                Effect.runFork(Queue.offer(server.connectionsQueue, clientConnection));

                return createInMemoryClientTransport(clientState);
              }),
              Effect.flatMap((transport) =>
                pipe(PubSub.publish(connectionStatePubSub, 'connected'), Effect.as(transport))
              )
            );
          })
        )
      )
    ),
    () => Effect.void
  );
};

// =============================================================================
// Server Implementation
// =============================================================================

const createInMemoryServerTransport = (serverId: string) =>
  Effect.acquireRelease(
    pipe(
      Queue.unbounded<Server.ClientConnection>(),
      Effect.flatMap((connectionsQueue) =>
        pipe(
          Effect.sync(() => {
            const clientConnections = new Map<
              string,
              {
                connection: Server.ClientConnection;
                clientState: InMemoryClientState;
              }
            >();

            const serverRegistry: InMemoryServerRegistryEntry = {
              connectionsQueue,
              clientConnections,
            };

            inMemoryRegistry.set(serverId, serverRegistry);

            return { connectionsQueue, clientConnections };
          }),
          Effect.map(({ connectionsQueue, clientConnections }) => ({
            connections: Stream.fromQueue(connectionsQueue),
            broadcast: (message: TransportMessage) =>
              Effect.forEach(
                Array.from(clientConnections.values()),
                ({ clientState }) => Queue.offer(clientState.serverToClientQueue, message),
                { discard: true }
              ),
          }))
        )
      )
    ),
    () =>
      Effect.sync(() => {
        inMemoryRegistry.delete(serverId);
      })
  );

// =============================================================================
// Exports
// =============================================================================

export const InMemoryConnector: Client.ConnectorInterface<TransportMessage> = {
  connect: inMemoryConnect,
};

export const InMemoryAcceptor = {
  make: (config: { serverId: string }) =>
    Effect.succeed({
      start: () => createInMemoryServerTransport(config.serverId),
    }),
};

// Maintain backward compatibility exports
export const SimpleInMemoryConnector = InMemoryConnector;
export const SimpleInMemoryAcceptor = InMemoryAcceptor;
