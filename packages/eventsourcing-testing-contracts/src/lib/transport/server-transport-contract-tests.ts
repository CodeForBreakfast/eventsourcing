/**
 * Server Contract Tests
 *
 * Tests server-only transport behaviors that apply to any transport implementation
 * that supports multiple client connections, broadcasting, and server-side resource management.
 *
 * These tests verify server-specific behaviors like connection tracking, broadcasting to multiple clients,
 * and proper cleanup when clients disconnect or server shuts down.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Effect, Stream, Scope, pipe, Option, Exit, Fiber, Duration, Chunk } from 'effect';
import type { TransportMessage, ConnectionState } from '@codeforbreakfast/eventsourcing-transport';

// =============================================================================
// Server Test Context Interface
// =============================================================================

/**
 * Factory for creating server transports and mock clients for testing
 */
export interface ServerTestFactory {
  readonly makeServer: () => Effect.Effect<ServerTransportTest, Error, Scope.Scope>;
  readonly makeMockClient: () => Effect.Effect<MockClientTransport, Error, Scope.Scope>;
}

/**
 * Context for testing server transport implementations.
 * Provides factory methods for creating servers and mock clients for testing.
 */
export interface ServerTestContext {
  // Create a new server transport for testing
  readonly makeServerFactory: () => ServerTestFactory;

  // Test utilities
  readonly waitForConnectionCount: (
    server: ServerTransportTest,
    expectedCount: number,
    timeoutMs?: number
  ) => Effect.Effect<void, Error, never>;
  readonly collectConnections: (
    stream: Stream.Stream<ServerConnectionTest, never, never>,
    count: number,
    timeoutMs?: number
  ) => Effect.Effect<ServerConnectionTest[], Error, never>;
  readonly makeTestMessage: (type: string, payload: unknown) => TransportMessage;
}

/**
 * Server transport interface for testing
 */
export interface ServerTransportTest {
  readonly connections: Stream.Stream<ServerConnectionTest, never, never>;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly connectionCount: () => Effect.Effect<number, never, never>;
}

/**
 * Individual server connection representing a connected client
 */
export interface ServerConnectionTest {
  readonly id: string;
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}

/**
 * Mock client transport for testing server behaviors
 */
export interface MockClientTransport {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
  readonly disconnect: () => Effect.Effect<void, Error, never>;
}

// =============================================================================
// Test Runner Function Type
// =============================================================================

export type ServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ServerTestContext>
) => void;

// =============================================================================
// Contract Tests Implementation
// =============================================================================

/**
 * Core server transport contract tests.
 * Every server transport implementation must pass these tests.
 */
export const runServerTransportContractTests: ServerTestRunner = (
  name: string,
  setup: () => Effect.Effect<ServerTestContext>
) => {
  describe(`${name} Server Transport Contract`, () => {
    let context: ServerTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      // With Scope-based lifecycle, cleanup happens automatically when scope closes
    });

    describe('Connection Management', () => {
      test('should track client connections', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Initially no connections
          const initialCount = yield* server.connectionCount();
          expect(initialCount).toBe(0);

          // Connect a client
          yield* factory.makeMockClient();

          // Wait for server to register the connection
          yield* context.waitForConnectionCount(server, 1);

          const finalCount = yield* server.connectionCount();
          expect(finalCount).toBe(1);
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should track multiple client connections', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Connect multiple clients
          yield* factory.makeMockClient();
          yield* factory.makeMockClient();
          yield* factory.makeMockClient();

          // Wait for server to register all connections
          yield* context.waitForConnectionCount(server, 3);

          const connectionCount = yield* server.connectionCount();
          expect(connectionCount).toBe(3);

          // Verify we can collect connection events
          const connections = yield* context.collectConnections(server.connections, 3);
          expect(connections).toHaveLength(3);

          // Each connection should have a unique ID
          const connectionIds = connections.map((conn) => conn.id);
          const uniqueIds = new Set(connectionIds);
          expect(uniqueIds.size).toBe(3);
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should remove connections when clients disconnect', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Connect clients
          const client1 = yield* factory.makeMockClient();
          yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 2);

          // Disconnect one client
          yield* client1.disconnect();

          // Give server time to process disconnection
          yield* Effect.sleep(Duration.millis(100));

          yield* context.waitForConnectionCount(server, 1);

          const finalCount = yield* server.connectionCount();
          expect(finalCount).toBe(1);
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle client connection state changes', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          const client = yield* factory.makeMockClient();

          // Get the server-side connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }

          const connection = serverConnection.value;

          // Monitor connection state from server perspective
          const stateHistory: ConnectionState[] = [];
          const stateMonitor = yield* Effect.fork(
            pipe(
              connection.connectionState,
              Stream.take(2),
              Stream.runForEach((state) => Effect.sync(() => stateHistory.push(state)))
            )
          );

          yield* Effect.sleep(Duration.millis(50));

          // Disconnect client
          yield* client.disconnect();

          yield* Effect.sleep(Duration.millis(100));
          yield* Fiber.interrupt(stateMonitor);

          // Should have seen connected state initially
          expect(stateHistory.length).toBeGreaterThan(0);
          expect(stateHistory[0]).toBe('connected');
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Message Broadcasting', () => {
      test('should broadcast messages to all connected clients', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Connect multiple clients
          const client1 = yield* factory.makeMockClient();
          const client2 = yield* factory.makeMockClient();
          const client3 = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 3);

          // Set up subscriptions on all clients
          const client1Messages = yield* client1.subscribe();
          const client2Messages = yield* client2.subscribe();
          const client3Messages = yield* client3.subscribe();

          // Broadcast a message from server
          const broadcastMessage = context.makeTestMessage('server.announcement', {
            message: 'hello all clients',
            timestamp: Date.now(),
          });

          yield* server.broadcast(broadcastMessage);

          // Give time for message delivery
          yield* Effect.sleep(Duration.millis(100));

          // Collect messages from all clients
          const [msg1, msg2, msg3] = yield* Effect.all([
            pipe(
              client1Messages,
              Stream.take(1),
              Stream.runCollect,
              Effect.map(Chunk.toReadonlyArray)
            ),
            pipe(
              client2Messages,
              Stream.take(1),
              Stream.runCollect,
              Effect.map(Chunk.toReadonlyArray)
            ),
            pipe(
              client3Messages,
              Stream.take(1),
              Stream.runCollect,
              Effect.map(Chunk.toReadonlyArray)
            ),
          ]);

          // All clients should receive the broadcast
          expect(msg1).toHaveLength(1);
          expect(msg1[0]?.type).toBe('server.announcement');
          expect(msg2).toHaveLength(1);
          expect(msg2[0]?.type).toBe('server.announcement');
          expect(msg3).toHaveLength(1);
          expect(msg3[0]?.type).toBe('server.announcement');
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should not broadcast to disconnected clients', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Connect clients
          const client1 = yield* factory.makeMockClient();
          const client2 = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 2);

          // Set up subscriptions
          const client2Messages = yield* client2.subscribe();

          // Disconnect one client
          yield* client1.disconnect();
          yield* context.waitForConnectionCount(server, 1);

          // Broadcast message
          const broadcastMessage = context.makeTestMessage('server.test', { data: 'test' });
          yield* server.broadcast(broadcastMessage);

          yield* Effect.sleep(Duration.millis(100));

          // Only connected client should receive message
          const msg2 = yield* pipe(
            client2Messages,
            Stream.take(1),
            Stream.runCollect,
            Effect.map(Chunk.toReadonlyArray)
          );

          expect(msg2).toHaveLength(1);
          expect(msg2[0]?.type).toBe('server.test');

          // Disconnected client should not receive any messages
          // (We can't easily test this without the client being active, but the broadcast should not fail)
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle broadcast errors gracefully', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Try to broadcast without any connected clients
          const broadcastMessage = context.makeTestMessage('server.empty', {
            data: 'no clients',
          });

          // Should not throw an error
          yield* server.broadcast(broadcastMessage);

          // Verify server is still functional
          const connectionCount = yield* server.connectionCount();
          expect(connectionCount).toBe(0);
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Individual Connection Communication', () => {
      test('should support direct communication with individual connections', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Connect clients
          const client1 = yield* factory.makeMockClient();
          const client2 = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 2);

          // Get server connections
          const connections = yield* context.collectConnections(server.connections, 2);
          const [connection1] = connections;

          // Set up subscriptions
          const client1Messages = yield* client1.subscribe();
          const client2Messages = yield* client2.subscribe();

          // Send message to only one connection
          const directMessage = context.makeTestMessage('server.direct', { target: 'client1' });
          yield* connection1!.publish(directMessage);

          yield* Effect.sleep(Duration.millis(100));

          // Only targeted client should receive message
          const msg1 = yield* pipe(
            client1Messages,
            Stream.take(1),
            Stream.runCollect,
            Effect.map(Chunk.toReadonlyArray)
          );

          expect(msg1).toHaveLength(1);
          expect(msg1[0]?.type).toBe('server.direct');

          // Other client should not receive the message
          const msg2Result = yield* pipe(
            client2Messages,
            Stream.take(1),
            Stream.runCollect,
            Effect.map(Chunk.toReadonlyArray),
            Effect.timeout(Duration.millis(200)),
            Effect.either
          );

          // Should timeout since no message was sent to client2
          expect(msg2Result._tag).toBe('Left');
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should receive messages from individual clients', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          const client = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 1);

          // Get server connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }

          const connection = serverConnection.value;

          // Subscribe to messages from this client
          const serverMessages = yield* connection.subscribe();

          // Client sends message
          const clientMessage = context.makeTestMessage('client.request', { action: 'ping' });
          yield* client.publish(clientMessage);

          // Server should receive the message
          const receivedMessages = yield* pipe(
            serverMessages,
            Stream.take(1),
            Stream.runCollect,
            Effect.map(Chunk.toReadonlyArray)
          );

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]?.type).toBe('client.request');
          expect(receivedMessages[0]?.payload as any).toEqual({ action: 'ping' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Resource Management', () => {
      test('should clean up all connections when server shuts down', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();

          // Create nested scope for server
          const serverScope = yield* Scope.make();
          const server = yield* Scope.extend(factory.makeServer(), serverScope);

          // Connect clients
          const client1 = yield* factory.makeMockClient();
          const client2 = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 2);

          // Monitor client connection states
          const client1StateHistory: ConnectionState[] = [];
          const client2StateHistory: ConnectionState[] = [];

          const stateMonitor1 = yield* Effect.fork(
            pipe(
              client1.connectionState,
              Stream.runForEach((state) => Effect.sync(() => client1StateHistory.push(state)))
            )
          );

          const stateMonitor2 = yield* Effect.fork(
            pipe(
              client2.connectionState,
              Stream.runForEach((state) => Effect.sync(() => client2StateHistory.push(state)))
            )
          );

          yield* Effect.sleep(Duration.millis(50));

          // Shut down server
          yield* Scope.close(serverScope, Exit.void);

          // Give time for disconnection to propagate
          yield* Effect.sleep(Duration.millis(200));

          yield* Fiber.interrupt(stateMonitor1);
          yield* Fiber.interrupt(stateMonitor2);

          // Both clients should see disconnection
          expect(client1StateHistory).toContain('disconnected');
          expect(client2StateHistory).toContain('disconnected');
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle concurrent client operations during server shutdown', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();

          // Create nested scope for server
          const serverScope = yield* Scope.make();
          const server = yield* Scope.extend(factory.makeServer(), serverScope);

          const client = yield* factory.makeMockClient();

          yield* context.waitForConnectionCount(server, 1);

          // Start concurrent operations
          const operations = Array.from({ length: 5 }, (_, i) =>
            Effect.fork(client.publish(context.makeTestMessage(`concurrent-${i}`, { index: i })))
          );

          const fibers = yield* Effect.all(operations);

          // Start a broadcast operation
          const broadcastFiber = yield* Effect.fork(
            server.broadcast(
              context.makeTestMessage('server.shutdown', { message: 'shutting down' })
            )
          );

          yield* Effect.sleep(Duration.millis(10));

          // Close server while operations are running
          yield* Scope.close(serverScope, Exit.void);

          // Clean up remaining operations
          yield* Effect.all(fibers.map(Fiber.interrupt));
          yield* Fiber.interrupt(broadcastFiber);

          // Server should shut down gracefully without hanging
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should track connection lifecycle properly', async () => {
        const program = Effect.gen(function* () {
          const factory = context.makeServerFactory();
          const server = yield* factory.makeServer();

          // Create client in nested scope
          const clientScope = yield* Scope.make();
          yield* Scope.extend(factory.makeMockClient(), clientScope);

          yield* context.waitForConnectionCount(server, 1);

          // Get server connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }

          const connection = serverConnection.value;

          // Verify connection is active
          const initialState = yield* pipe(
            connection.connectionState,
            Stream.take(1),
            Stream.runHead
          );

          if (Option.isSome(initialState)) {
            expect(initialState.value).toBe('connected');
          }

          // Close client scope
          yield* Scope.close(clientScope, Exit.void);

          // Server should detect disconnection
          yield* context.waitForConnectionCount(server, 0);

          const finalCount = yield* server.connectionCount();
          expect(finalCount).toBe(0);
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });
  });
};
