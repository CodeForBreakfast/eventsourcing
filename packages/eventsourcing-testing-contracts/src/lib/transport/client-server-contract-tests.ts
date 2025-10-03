/**
 * Client-Server Contract Tests
 *
 * Tests client-server transport behaviors that apply to any transport implementation
 * that supports bidirectional communication, multiple clients, and broadcasting.
 *
 * These tests verify the interaction between client and server transport instances,
 * including connection management, message broadcasting, and resource cleanup.
 */

import { describe, test, expect, beforeEach, afterEach } from '@codeforbreakfast/buntest';
import { Effect, Stream, Scope, pipe, Option, Exit } from 'effect';
import type { TransportMessage, ConnectionState } from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Client-Server Test Context Interface
// =============================================================================

/**
 * Factory for creating paired client-server transports.
 * Each call creates a new pair that can communicate with each other.
 */
export interface TransportPair {
  readonly makeServer: () => Effect.Effect<ServerTransport, Error, Scope.Scope>;
  readonly makeClient: () => Effect.Effect<ClientTransport, Error, Scope.Scope>;
}

/**
 * Context for testing client-server transport implementations.
 * Provides factory methods for creating transport pairs and test utilities.
 */
export interface ClientServerTestContext {
  // Create a new transport pair for testing
  readonly makeTransportPair: () => TransportPair;

  // Test utilities
  readonly waitForConnectionState: (
    transport: ClientTransport,
    expectedState: ConnectionState,
    timeoutMs?: number
  ) => Effect.Effect<void, Error, never>;
  readonly collectMessages: <T>(
    stream: Stream.Stream<T, never, never>,
    count: number,
    timeoutMs?: number
  ) => Effect.Effect<T[], Error, never>;
  readonly makeTestMessage: (type: string, payload: unknown) => TransportMessage;
}

/**
 * Server transport interface for testing
 */
export interface ServerTransport {
  readonly connections: Stream.Stream<ServerConnection, never, never>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void, Error, never>;
}

/**
 * Individual server connection representing a connected client
 */
export interface ServerConnection {
  readonly id: string;
  readonly transport: ClientTransport; // The server-side view of the client connection
}

/**
 * Client transport interface for testing
 */
export interface ClientTransport {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}

// =============================================================================
// Test Runner Function Type
// =============================================================================

export type ClientServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ClientServerTestContext>
) => void;

// =============================================================================
// Contract Tests Implementation
// =============================================================================

/**
 * Core client-server contract tests.
 *
 * This is the primary export for testing bidirectional communication between client and server
 * transport instances. These tests verify the interaction patterns, connection management,
 * and message flow between paired transport endpoints.
 *
 * ## What This Tests
 *
 * - **Connection Management**: Establishing client-server connections, handling multiple clients
 *   connecting to the same server, and proper connection lifecycle management
 * - **Message Communication**: Client-to-server message publishing, server-to-client broadcasting,
 *   bidirectional request-response patterns, and message filtering on the client side
 * - **Connection Lifecycle**: Graceful client disconnection, server shutdown handling,
 *   resource cleanup when scopes close, and connection state synchronization
 * - **Error Handling**: Managing malformed messages, connection errors, and ensuring
 *   graceful degradation during communication failures
 *
 * ## Real Usage Examples
 *
 * **WebSocket Integration:**
 * See `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 38-95)
 * - Shows `TransportPair` implementation with random port allocation
 * - Demonstrates real WebSocket server/client coordination
 * - Includes proper error mapping and connection state management
 * - Line 116: `runClientServerContractTests('WebSocket', createWebSocketTestContext)`
 *
 * **InMemory Integration:**
 * See `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 37-104)
 * - Shows shared server instance pattern for synchronized testing
 * - Demonstrates direct connection without network protocols
 * - Line 126: `runClientServerContractTests('InMemory', createInMemoryTestContext)`
 *
 * Both implementations include transport-specific tests alongside the standard contracts.
 *
 * ## Required Interface
 *
 * Your setup function must return a `ClientServerTestContext` that provides:
 * - `makeTransportPair`: Factory that creates paired client/server transports that can communicate
 * - `waitForConnectionState`: Utility to wait for specific connection states
 * - `collectMessages`: Utility to collect messages from streams with timeout
 * - `makeTestMessage`: Factory for creating standardized test messages
 *
 * ## Test Categories
 *
 * 1. **Connection Management**: Tests client-server connection establishment and multi-client scenarios
 * 2. **Message Communication**: Tests all forms of client-server communication patterns
 * 3. **Connection Lifecycle**: Tests graceful shutdown and cleanup scenarios
 * 4. **Error Handling**: Tests resilience to malformed messages and connection errors
 *
 * ## Transport Pair Requirements
 *
 * Your `makeTransportPair` function must return an object with:
 * - `makeServer`: Creates a server transport within a scope
 * - `makeClient`: Creates a client transport that connects to the server within a scope
 *
 * Both server and client must be automatically cleaned up when their respective scopes close.
 *
 * ## Server Interface Requirements
 *
 * Your server implementation must provide:
 * - `connections`: Stream that emits server-side connection objects when clients connect
 * - `broadcast`: Function to send messages to all connected clients
 *
 * ## Client Interface Requirements
 *
 * Your client implementation must provide:
 * - `connectionState`: Stream that emits connection state changes
 * - `publish`: Function to send messages to the server
 * - `subscribe`: Function to subscribe to messages from the server (with optional filtering)
 *
 * ## Connection Object Requirements
 *
 * Server connection objects must provide:
 * - `id`: Unique identifier for the connection
 * - `transport`: Client transport interface for server-side communication
 *
 * @param name - Descriptive name for your transport integration (e.g., "WebSocket Integration")
 * @param setup - Function that returns Effect yielding ClientServerTestContext for your paired transports
 *
 * @example
 * For complete working examples, see:
 * - WebSocket: `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts`
 * - InMemory: `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts`
 * Both demonstrate real client-server transport implementations passing all contract tests.
 */
export const runClientServerContractTests: ClientServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ClientServerTestContext>
) => {
  describe(`${name} Client-Server Contract`, () => {
    let context: ClientServerTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      // With Scope-based lifecycle, cleanup happens automatically when scope closes
    });

    describe('Connection Management', () => {
      test('should establish basic client-server connection', async () => {
        const pair = context.makeTransportPair();

        const program = pipe(
          pair.makeServer(),
          Effect.flatMap(() => Effect.sleep(100)),
          Effect.flatMap(() => pair.makeClient()),
          Effect.flatMap((client) =>
            Effect.flatMap(context.waitForConnectionState(client, 'connected'), () =>
              Effect.flatMap(
                Stream.runHead(
                  Stream.take(
                    Stream.filter(client.connectionState, (state) => state === 'connected'),
                    1
                  )
                ),
                (clientState) => {
                  if (Option.isSome(clientState)) {
                    return Effect.sync(() => expect(clientState.value).toBe('connected'));
                  } else {
                    return Effect.fail(new Error('Expected client to reach connected state'));
                  }
                }
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle multiple clients connecting to same server', async () => {
        const pair = context.makeTransportPair();

        const program = pipe(
          pair.makeServer(),
          Effect.flatMap((server) =>
            Effect.flatMap(Effect.sleep(100), () =>
              Effect.flatMap(
                Effect.all([pair.makeClient(), pair.makeClient(), pair.makeClient()]),
                ([client1, client2, client3]) =>
                  Effect.flatMap(
                    Effect.all([
                      context.waitForConnectionState(client1, 'connected'),
                      context.waitForConnectionState(client2, 'connected'),
                      context.waitForConnectionState(client3, 'connected'),
                    ]),
                    () =>
                      Effect.tap(
                        Effect.timeout(Stream.runCollect(Stream.take(server.connections, 3)), 5000),
                        (connections) =>
                          Effect.sync(() => expect(Array.from(connections)).toHaveLength(3))
                      )
                  )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Message Communication', () => {
      test('should support client-to-server message publishing', async () => {
        const pair = context.makeTransportPair();
        const testMessage = context.makeTestMessage('test.message', { data: 'hello server' });

        const program = pipe(
          pair.makeServer(),
          Effect.flatMap((server) =>
            Effect.flatMap(Effect.sleep(100), () =>
              Effect.flatMap(pair.makeClient(), (client) =>
                Effect.flatMap(context.waitForConnectionState(client, 'connected'), () =>
                  Effect.flatMap(
                    Stream.runHead(Stream.take(server.connections, 1)),
                    (serverConnection) => {
                      if (!Option.isSome(serverConnection)) {
                        return Effect.fail(new Error('Expected server connection to be available'));
                      }
                      const connection = serverConnection.value;
                      return Effect.flatMap(connection.transport.subscribe(), (messageStream) =>
                        Effect.tap(
                          Effect.flatMap(client.publish(testMessage), () =>
                            context.collectMessages(messageStream, 1)
                          ),
                          (receivedMessages) =>
                            Effect.sync(() => {
                              expect(receivedMessages).toHaveLength(1);
                              expect(receivedMessages[0]?.type).toBe('test.message');
                              expect(receivedMessages[0]?.payload).toBe(
                                JSON.stringify({ data: 'hello server' })
                              );
                            })
                        )
                      );
                    }
                  )
                )
              )
            )
          )
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support server-to-client broadcasting', async () => {
        const verifyBroadcast = ([client1Received, client2Received]: [
          TransportMessage[],
          TransportMessage[],
        ]) =>
          Effect.sync(() => {
            expect(client1Received).toHaveLength(1);
            expect(client1Received[0]?.type).toBe('server.broadcast');
            expect(client1Received[0]?.payload).toBe(
              JSON.stringify({ announcement: 'hello all clients' })
            );

            expect(client2Received).toHaveLength(1);
            expect(client2Received[0]?.type).toBe('server.broadcast');
            expect(client2Received[0]?.payload).toBe(
              JSON.stringify({ announcement: 'hello all clients' })
            );
          });

        const broadcastAndCollect = (
          server: ServerTransport,
          client1Messages: Stream.Stream<TransportMessage, never, never>,
          client2Messages: Stream.Stream<TransportMessage, never, never>
        ) => {
          const broadcastMessage = context.makeTestMessage('server.broadcast', {
            announcement: 'hello all clients',
          });
          return pipe(
            server.broadcast(broadcastMessage),
            Effect.flatMap(() =>
              Effect.all([
                context.collectMessages(client1Messages, 1),
                context.collectMessages(client2Messages, 1),
              ])
            ),
            Effect.tap(verifyBroadcast)
          );
        };

        const subscribeAndBroadcast = (
          server: ServerTransport,
          client1: ClientTransport,
          client2: ClientTransport
        ) =>
          pipe(
            Effect.all([client1.subscribe(), client2.subscribe()]),
            Effect.flatMap(([client1Messages, client2Messages]) =>
              broadcastAndCollect(server, client1Messages, client2Messages)
            )
          );

        const waitForClientsAndBroadcast = (
          server: ServerTransport,
          client1: ClientTransport,
          client2: ClientTransport
        ) =>
          pipe(
            Effect.all([
              context.waitForConnectionState(client1, 'connected'),
              context.waitForConnectionState(client2, 'connected'),
            ]),
            Effect.flatMap(() => subscribeAndBroadcast(server, client1, client2))
          );

        const createClientsAndBroadcast = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            Effect.all([pair.makeClient(), pair.makeClient()]),
            Effect.flatMap(([client1, client2]) =>
              waitForClientsAndBroadcast(server, client1, client2)
            )
          );

        const setupServerAndBroadcast = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createClientsAndBroadcast(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndBroadcast)
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support bidirectional communication', async () => {
        const verifyServerReceived = (serverReceivedMessages: TransportMessage[]) =>
          Effect.sync(() => {
            expect(serverReceivedMessages[0]?.payload).toBe(JSON.stringify({ query: 'ping' }));
          });

        const verifyClientReceived = (clientReceivedMessages: TransportMessage[]) =>
          Effect.sync(() => {
            expect(clientReceivedMessages[0]?.payload).toBe(JSON.stringify({ result: 'pong' }));
          });

        const sendServerResponseAndVerify = (
          connection: ServerConnection,
          clientMessages: Stream.Stream<TransportMessage, never, never>
        ) => {
          const serverResponse = context.makeTestMessage('server.response', { result: 'pong' });
          return pipe(
            connection.transport.publish(serverResponse),
            Effect.flatMap(() => context.collectMessages(clientMessages, 1)),
            Effect.tap(verifyClientReceived)
          );
        };

        const publishClientRequestAndVerify = (
          client: ClientTransport,
          serverMessages: Stream.Stream<TransportMessage, never, never>,
          connection: ServerConnection,
          clientMessages: Stream.Stream<TransportMessage, never, never>
        ) => {
          const clientMessage = context.makeTestMessage('client.request', { query: 'ping' });
          return pipe(
            client.publish(clientMessage),
            Effect.flatMap(() => context.collectMessages(serverMessages, 1)),
            Effect.tap(verifyServerReceived),
            Effect.flatMap(() => sendServerResponseAndVerify(connection, clientMessages))
          );
        };

        const subscribeAndCommunicate = (client: ClientTransport, connection: ServerConnection) =>
          pipe(
            Effect.all([client.subscribe(), connection.transport.subscribe()]),
            Effect.flatMap(([clientMessages, serverMessages]) =>
              publishClientRequestAndVerify(client, serverMessages, connection, clientMessages)
            )
          );

        const handleServerConnection =
          (client: ClientTransport) => (serverConnection: Option.Option<ServerConnection>) => {
            if (!Option.isSome(serverConnection)) {
              return Effect.fail(new Error('Expected server connection to be available'));
            }
            const connection = serverConnection.value;
            return subscribeAndCommunicate(client, connection);
          };

        const getConnectionAndCommunicate = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            server.connections,
            Stream.take(1),
            Stream.runHead,
            Effect.flatMap(handleServerConnection(client))
          );

        const waitAndCommunicate = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            context.waitForConnectionState(client, 'connected'),
            Effect.flatMap(() => getConnectionAndCommunicate(server, client))
          );

        const createClientAndCommunicate = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            pair.makeClient(),
            Effect.flatMap((client) => waitAndCommunicate(server, client))
          );

        const setupServerAndCommunicate = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createClientAndCommunicate(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndCommunicate)
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should filter messages correctly on client side', async () => {
        const verifyFilteredMessages = (receivedMessages: TransportMessage[]) =>
          Effect.sync(() => {
            expect(receivedMessages).toHaveLength(2);
            expect(receivedMessages[0]?.type).toBe('important.alert');
            expect(receivedMessages[0]?.payload).toBe(JSON.stringify({ data: 2 }));
            expect(receivedMessages[1]?.type).toBe('important.notification');
            expect(receivedMessages[1]?.payload).toBe(JSON.stringify({ data: 4 }));
          });

        const broadcastMessagesAndCollect = (
          server: ServerTransport,
          filteredMessages: Stream.Stream<TransportMessage, never, never>
        ) =>
          pipe(
            Effect.all([
              server.broadcast(context.makeTestMessage('normal.message', { data: 1 })),
              server.broadcast(context.makeTestMessage('important.alert', { data: 2 })),
              server.broadcast(context.makeTestMessage('debug.info', { data: 3 })),
              server.broadcast(context.makeTestMessage('important.notification', { data: 4 })),
            ]),
            Effect.flatMap(() => context.collectMessages(filteredMessages, 2)),
            Effect.tap(verifyFilteredMessages)
          );

        const subscribeAndBroadcast = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            client.subscribe((msg) => msg.type.startsWith('important.')),
            Effect.flatMap((filteredMessages) =>
              broadcastMessagesAndCollect(server, filteredMessages)
            )
          );

        const waitAndTest = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            context.waitForConnectionState(client, 'connected'),
            Effect.flatMap(() => subscribeAndBroadcast(server, client))
          );

        const createClientAndTest = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            pair.makeClient(),
            Effect.flatMap((client) => waitAndTest(server, client))
          );

        const setupServerAndTest = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createClientAndTest(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndTest)
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Connection Lifecycle', () => {
      test('should handle graceful client disconnection', async () => {
        const verifyDisconnectedState = (finalClientState: Option.Option<ConnectionState>) => {
          if (Option.isSome(finalClientState)) {
            return Effect.sync(() => expect(finalClientState.value).toBe('disconnected'));
          } else {
            return Effect.fail(new Error('Expected final client state to be available'));
          }
        };

        const waitForDisconnectedState = (connection: ServerConnection) =>
          pipe(
            connection.transport.connectionState,
            Stream.filter((state) => state === 'disconnected'),
            Stream.take(1),
            Stream.runHead,
            Effect.timeout(2000),
            Effect.flatMap(verifyDisconnectedState)
          );

        const closeScopeAndVerify = (clientScope: Scope.CloseableScope, connection: ServerConnection) =>
          pipe(
            Scope.close(clientScope, Exit.void),
            Effect.flatMap(() => Effect.sleep(100)),
            Effect.flatMap(() => waitForDisconnectedState(connection))
          );

        const handleServerConnection =
          (clientScope: Scope.CloseableScope) => (serverConnection: Option.Option<ServerConnection>) => {
            if (!Option.isSome(serverConnection)) {
              return Effect.fail(new Error('Expected server connection to be available'));
            }
            return closeScopeAndVerify(clientScope, serverConnection.value);
          };

        const getConnectionAndDisconnect = (server: ServerTransport, clientScope: Scope.CloseableScope) =>
          pipe(
            server.connections,
            Stream.take(1),
            Stream.runHead,
            Effect.flatMap(handleServerConnection(clientScope))
          );

        const waitAndDisconnect = (
          client: ClientTransport,
          server: ServerTransport,
          clientScope: Scope.CloseableScope
        ) =>
          pipe(
            context.waitForConnectionState(client, 'connected'),
            Effect.flatMap(() => getConnectionAndDisconnect(server, clientScope))
          );

        const createClientAndDisconnect = (
          clientScope: Scope.CloseableScope,
          server: ServerTransport,
          pair: TransportPair
        ) =>
          pipe(
            Scope.extend(pair.makeClient(), clientScope),
            Effect.flatMap((client) => waitAndDisconnect(client, server, clientScope))
          );

        const createScopeAndTest = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            Scope.make(),
            Effect.flatMap((clientScope) => createClientAndDisconnect(clientScope, server, pair))
          );

        const setupServerAndTest = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createScopeAndTest(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndTest)
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle server shutdown gracefully', async () => {
        const verifyDisconnectedState = (disconnectedState: Option.Option<ConnectionState>) => {
          if (Option.isSome(disconnectedState)) {
            return Effect.sync(() => expect(disconnectedState.value).toBe('disconnected'));
          } else {
            return Effect.fail(new Error('Expected disconnected state to be available'));
          }
        };

        const waitForDisconnection = (client: ClientTransport) =>
          pipe(
            client.connectionState,
            Stream.filter((state) => state === 'disconnected'),
            Stream.take(1),
            Stream.runHead,
            Effect.timeout(5000),
            Effect.flatMap(verifyDisconnectedState)
          );

        const closeServerAndVerify = (serverScope: Scope.CloseableScope, client: ClientTransport) =>
          pipe(
            Scope.close(serverScope, Exit.void),
            Effect.flatMap(() => waitForDisconnection(client))
          );

        const waitAndCloseServer = (client: ClientTransport, serverScope: Scope.CloseableScope) =>
          pipe(
            context.waitForConnectionState(client, 'connected'),
            Effect.flatMap(() => closeServerAndVerify(serverScope, client))
          );

        const createClientAndTest = (serverScope: Scope.CloseableScope, pair: TransportPair) =>
          pipe(
            pair.makeClient(),
            Effect.flatMap((client) => waitAndCloseServer(client, serverScope))
          );

        const setupServerAndClient = (serverScope: Scope.CloseableScope, pair: TransportPair) =>
          pipe(
            Scope.extend(pair.makeServer(), serverScope),
            Effect.flatMap(() => Effect.sleep(100)),
            Effect.flatMap(() => createClientAndTest(serverScope, pair))
          );

        const createScopeAndTest = (pair: TransportPair) =>
          pipe(
            Scope.make(),
            Effect.flatMap((serverScope) => setupServerAndClient(serverScope, pair))
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(createScopeAndTest)
        );

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should clean up resources when scope closes', async () => {
        const verifyConnectionCount = (connections: unknown) =>
          Effect.sync(() => expect(Array.from(connections as Iterable<unknown>)).toHaveLength(2));

        const collectAndVerifyConnections = (server: ServerTransport) =>
          pipe(
            server.connections,
            Stream.take(2),
            Stream.runCollect,
            Effect.tap(verifyConnectionCount)
          );

        const waitForClientsAndVerify = (
          server: ServerTransport,
          client1: ClientTransport,
          client2: ClientTransport
        ) =>
          pipe(
            Effect.all([
              context.waitForConnectionState(client1, 'connected'),
              context.waitForConnectionState(client2, 'connected'),
            ]),
            Effect.flatMap(() => collectAndVerifyConnections(server))
          );

        const createClientsAndVerify = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            Effect.all([pair.makeClient(), pair.makeClient()]),
            Effect.flatMap(([client1, client2]) =>
              waitForClientsAndVerify(server, client1, client2)
            )
          );

        const setupServerAndClients = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createClientsAndVerify(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndClients)
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Error Handling', () => {
      test('should handle malformed messages gracefully', async () => {
        const verifyReceivedMessage = (receivedMessages: TransportMessage[]) =>
          Effect.sync(() => expect(receivedMessages[0]?.type).toBe('valid.message'));

        const publishAndVerify = (
          client: ClientTransport,
          messageStream: Stream.Stream<TransportMessage, never, never>
        ) => {
          const validMessage = context.makeTestMessage('valid.message', { data: 'good' });
          return pipe(
            client.publish(validMessage),
            Effect.flatMap(() => context.collectMessages(messageStream, 1)),
            Effect.tap(verifyReceivedMessage)
          );
        };

        const subscribeAndPublish = (connection: ServerConnection, client: ClientTransport) =>
          pipe(
            connection.transport.subscribe(),
            Effect.flatMap((messageStream) => publishAndVerify(client, messageStream))
          );

        const handleServerConnection =
          (client: ClientTransport) => (serverConnection: Option.Option<ServerConnection>) => {
            if (!Option.isSome(serverConnection)) {
              return Effect.fail(new Error('Expected server connection to be available'));
            }
            const connection = serverConnection.value;
            return subscribeAndPublish(connection, client);
          };

        const getConnectionAndPublish = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            server.connections,
            Stream.take(1),
            Stream.runHead,
            Effect.flatMap(handleServerConnection(client))
          );

        const waitAndPublish = (server: ServerTransport, client: ClientTransport) =>
          pipe(
            context.waitForConnectionState(client, 'connected'),
            Effect.flatMap(() => getConnectionAndPublish(server, client))
          );

        const createClientAndPublish = (server: ServerTransport, pair: TransportPair) =>
          pipe(
            pair.makeClient(),
            Effect.flatMap((client) => waitAndPublish(server, client))
          );

        const setupServerAndTest = (pair: TransportPair) =>
          pipe(
            pair.makeServer(),
            Effect.flatMap((server) =>
              pipe(
                Effect.sleep(100),
                Effect.flatMap(() => createClientAndPublish(server, pair))
              )
            )
          );

        const program = pipe(
          Effect.sync(() => context.makeTransportPair()),
          Effect.flatMap(setupServerAndTest)
        );

        await Effect.runPromise(Effect.scoped(program));
      });
    });
  });
};
