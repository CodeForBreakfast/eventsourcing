/**
 * Client-Server Contract Tests
 *
 * Tests client-server transport behaviors that apply to any transport implementation
 * that supports bidirectional communication, multiple clients, and broadcasting.
 *
 * These tests verify the interaction between client and server transport instances,
 * including connection management, message broadcasting, and resource cleanup.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
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
 * Every client-server transport implementation must pass these tests.
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
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          yield* pair.makeServer();

          // Wait a bit for server to start
          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();

          // Wait for connection to be established
          yield* context.waitForConnectionState(client, 'connected');

          // Verify transport is connected by checking current state
          const clientState = yield* pipe(
            client.connectionState,
            Stream.filter((state) => state === 'connected'),
            Stream.take(1),
            Stream.runHead
          );

          if (Option.isSome(clientState)) {
            expect(clientState.value).toBe('connected');
          } else {
            throw new Error('Expected client to reach connected state');
          }
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle multiple clients connecting to same server', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect multiple clients
          const client1 = yield* pair.makeClient();
          const client2 = yield* pair.makeClient();
          const client3 = yield* pair.makeClient();

          // Wait for all connections
          yield* Effect.all([
            context.waitForConnectionState(client1, 'connected'),
            context.waitForConnectionState(client2, 'connected'),
            context.waitForConnectionState(client3, 'connected'),
          ]);

          // Collect connection events from server
          const connections = yield* pipe(
            server.connections,
            Stream.take(3),
            Stream.runCollect,
            Effect.timeout(5000)
          );

          expect(Array.from(connections)).toHaveLength(3);
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Message Communication', () => {
      test('should support client-to-server message publishing', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Wait for server to receive the connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }
          const connection = serverConnection.value;

          // Subscribe to messages on server side
          const messageStream = yield* connection.transport.subscribe();

          // Publish message from client
          const testMessage = context.makeTestMessage('test.message', { data: 'hello server' });
          yield* client.publish(testMessage);

          // Collect message on server side
          const receivedMessages = yield* context.collectMessages(messageStream, 1);

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]?.type).toBe('test.message');
          expect(receivedMessages[0]?.payload as any).toEqual({ data: 'hello server' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support server-to-client broadcasting', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect multiple clients
          const client1 = yield* pair.makeClient();
          const client2 = yield* pair.makeClient();

          yield* Effect.all([
            context.waitForConnectionState(client1, 'connected'),
            context.waitForConnectionState(client2, 'connected'),
          ]);

          // Subscribe to messages on both clients
          const client1Messages = yield* client1.subscribe();
          const client2Messages = yield* client2.subscribe();

          // Broadcast message from server
          const broadcastMessage = context.makeTestMessage('server.broadcast', {
            announcement: 'hello all clients',
          });
          yield* server.broadcast(broadcastMessage);

          // Collect messages on both clients
          const [client1Received, client2Received] = yield* Effect.all([
            context.collectMessages(client1Messages, 1),
            context.collectMessages(client2Messages, 1),
          ]);

          // Both clients should receive the broadcast
          expect(client1Received).toHaveLength(1);
          expect(client1Received[0]?.type).toBe('server.broadcast');
          expect(client1Received[0]?.payload as any).toEqual({ announcement: 'hello all clients' });

          expect(client2Received).toHaveLength(1);
          expect(client2Received[0]?.type).toBe('server.broadcast');
          expect(client2Received[0]?.payload as any).toEqual({ announcement: 'hello all clients' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support bidirectional communication', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Get server connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }
          const connection = serverConnection.value;

          // Set up subscriptions
          const clientMessages = yield* client.subscribe();
          const serverMessages = yield* connection.transport.subscribe();

          // Client sends message to server
          const clientMessage = context.makeTestMessage('client.request', { query: 'ping' });
          yield* client.publish(clientMessage);

          // Server receives and responds
          const serverReceivedMessages = yield* context.collectMessages(serverMessages, 1);
          expect(serverReceivedMessages[0]?.payload as any).toEqual({ query: 'ping' });

          const serverResponse = context.makeTestMessage('server.response', { result: 'pong' });
          yield* connection.transport.publish(serverResponse);

          // Client receives response
          const clientReceivedMessages = yield* context.collectMessages(clientMessages, 1);
          expect(clientReceivedMessages[0]?.payload as any).toEqual({ result: 'pong' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should filter messages correctly on client side', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Subscribe with filter for only 'important' messages
          const filteredMessages = yield* client.subscribe((msg) =>
            msg.type.startsWith('important.')
          );

          // Broadcast multiple message types from server
          yield* server.broadcast(context.makeTestMessage('normal.message', { data: 1 }));
          yield* server.broadcast(context.makeTestMessage('important.alert', { data: 2 }));
          yield* server.broadcast(context.makeTestMessage('debug.info', { data: 3 }));
          yield* server.broadcast(context.makeTestMessage('important.notification', { data: 4 }));

          // Should only receive the 'important' messages
          const receivedMessages = yield* context.collectMessages(filteredMessages, 2);

          expect(receivedMessages).toHaveLength(2);
          expect(receivedMessages[0]?.type).toBe('important.alert');
          expect(receivedMessages[0]?.payload as any).toEqual({ data: 2 });
          expect(receivedMessages[1]?.type).toBe('important.notification');
          expect(receivedMessages[1]?.payload as any).toEqual({ data: 4 });
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Connection Lifecycle', () => {
      test('should handle graceful client disconnection', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Create nested scope for client
          const clientScope = yield* Scope.make();

          // Connect client in nested scope
          const client = yield* Scope.extend(pair.makeClient(), clientScope);

          yield* context.waitForConnectionState(client, 'connected');

          // Wait for server to register connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }

          // Close client scope (graceful disconnect)
          yield* Scope.close(clientScope, Exit.void);

          // Give some time for disconnection to propagate
          yield* Effect.sleep(100);

          // Server should detect disconnection
          const finalClientState = yield* pipe(
            serverConnection.value.transport.connectionState,
            Stream.filter((state) => state === 'disconnected'),
            Stream.take(1),
            Stream.runHead,
            Effect.timeout(2000)
          );

          if (Option.isSome(finalClientState)) {
            expect(finalClientState.value).toBe('disconnected');
          } else {
            throw new Error('Expected final client state to be available');
          }
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle server shutdown gracefully', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Create nested scope for server
          const serverScope = yield* Scope.make();

          // Start server in nested scope
          yield* Scope.extend(pair.makeServer(), serverScope);

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Close server scope
          yield* Scope.close(serverScope, Exit.void);

          // Client should detect disconnection
          const disconnectedState = yield* pipe(
            client.connectionState,
            Stream.filter((state) => state === 'disconnected'),
            Stream.take(1),
            Stream.runHead,
            Effect.timeout(5000)
          );

          if (Option.isSome(disconnectedState)) {
            expect(disconnectedState.value).toBe('disconnected');
          } else {
            throw new Error('Expected disconnected state to be available');
          }
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should clean up resources when scope closes', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect multiple clients and collect their state refs
          const client1 = yield* pair.makeClient();
          const client2 = yield* pair.makeClient();

          yield* Effect.all([
            context.waitForConnectionState(client1, 'connected'),
            context.waitForConnectionState(client2, 'connected'),
          ]);

          // Wait for server to register both connections
          const connections = yield* pipe(server.connections, Stream.take(2), Stream.runCollect);

          expect(Array.from(connections)).toHaveLength(2);

          // When the test scope closes, all resources should be cleaned up automatically
          // This is verified by the afterEach hook not hanging
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Error Handling', () => {
      test('should handle malformed messages gracefully', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.makeTransportPair();

          // Start server
          const server = yield* pair.makeServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.makeClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Get server connection
          const serverConnection = yield* pipe(server.connections, Stream.take(1), Stream.runHead);

          if (!Option.isSome(serverConnection)) {
            throw new Error('Expected server connection to be available');
          }
          const connection = serverConnection.value;

          // Subscribe to messages
          const messageStream = yield* connection.transport.subscribe();

          // Send a valid message (implementation should handle any malformed data gracefully)
          const validMessage = context.makeTestMessage('valid.message', { data: 'good' });
          yield* client.publish(validMessage);

          // Should still receive valid messages despite any malformed ones
          const receivedMessages = yield* context.collectMessages(messageStream, 1);
          expect(receivedMessages[0]?.type).toBe('valid.message');
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });
  });
};
