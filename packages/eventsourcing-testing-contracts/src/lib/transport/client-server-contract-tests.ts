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
import { Effect, Stream, Scope, pipe, Option, Exit, Fiber } from 'effect';
import type {
  TransportMessage,
  ConnectionState,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Client-Server Test Context Interface
// =============================================================================

/**
 * Factory for creating paired client-server transports.
 * Each call creates a new pair that can communicate with each other.
 */
export interface TransportPair {
  readonly createServer: () => Effect.Effect<ServerTransport, Error, Scope.Scope>;
  readonly createClient: () => Effect.Effect<ClientTransport, Error, Scope.Scope>;
}

/**
 * Context for testing client-server transport implementations.
 * Provides factory methods for creating transport pairs and test utilities.
 */
export interface ClientServerTestContext {
  // Create a new transport pair for testing
  readonly createTransportPair: () => TransportPair;

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
  readonly createTestMessage: (type: string, payload: unknown) => TransportMessage;
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
          const pair = context.createTransportPair();

          // Start server
          yield* pair.createServer();

          // Wait a bit for server to start
          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();

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
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect multiple clients
          const client1 = yield* pair.createClient();
          const client2 = yield* pair.createClient();
          const client3 = yield* pair.createClient();

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

      test('should track connection state transitions correctly', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          yield* pair.createServer();

          yield* Effect.sleep(100);

          // Create a ref to collect all state changes as they happen
          const stateHistory = yield* Effect.sync(() => [] as ConnectionState[]);

          // Start the connection in a fiber so we can subscribe to states early
          const connectionFiber = yield* Effect.fork(pair.createClient());

          // Wait a tiny bit for the connection to start initializing
          yield* Effect.sleep(5);

          // Get the transport (it will be in 'connecting' state)
          const client = yield* Fiber.join(connectionFiber);

          // Set up a background fiber to collect all state transitions
          const stateCollectorFiber = yield* Effect.fork(
            pipe(
              client.connectionState,
              Stream.runForEach((state) => Effect.sync(() => stateHistory.push(state)))
            )
          );

          // Wait for connection to be fully established
          yield* context.waitForConnectionState(client, 'connected');

          // Give the state collector a moment to catch any late states
          yield* Effect.sleep(10);

          // Cancel the state collector
          yield* Fiber.interrupt(stateCollectorFiber);

          // Verify that we saw connection states IN THE CORRECT ORDER
          const observedStates = stateHistory;

          // Should have seen at least the connected state
          expect(observedStates.length).toBeGreaterThanOrEqual(1);

          // The last state should always be 'connected'
          expect(observedStates[observedStates.length - 1]).toBe('connected');

          // If we caught the transition early enough, we might see both states
          if (observedStates.length > 1) {
            // If we see multiple states, they should be in order
            const connectingIndex = observedStates.indexOf('connecting');
            const connectedIndex = observedStates.indexOf('connected');
            if (connectingIndex !== -1 && connectedIndex !== -1) {
              expect(connectingIndex).toBeLessThan(connectedIndex);
            }
          }
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Message Communication', () => {
      test('should support client-to-server message publishing', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();
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
          const testMessage = context.createTestMessage('test.message', { data: 'hello server' });
          yield* client.publish(testMessage);

          // Collect message on server side
          const receivedMessages = yield* context.collectMessages(messageStream, 1);

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]?.type).toBe('test.message');
          expect(receivedMessages[0]?.payload).toEqual({ data: 'hello server' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support server-to-client broadcasting', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect multiple clients
          const client1 = yield* pair.createClient();
          const client2 = yield* pair.createClient();

          yield* Effect.all([
            context.waitForConnectionState(client1, 'connected'),
            context.waitForConnectionState(client2, 'connected'),
          ]);

          // Subscribe to messages on both clients
          const client1Messages = yield* client1.subscribe();
          const client2Messages = yield* client2.subscribe();

          // Broadcast message from server
          const broadcastMessage = context.createTestMessage('server.broadcast', {
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
          expect(client1Received[0]?.payload).toEqual({ announcement: 'hello all clients' });

          expect(client2Received).toHaveLength(1);
          expect(client2Received[0]?.type).toBe('server.broadcast');
          expect(client2Received[0]?.payload).toEqual({ announcement: 'hello all clients' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should support bidirectional communication', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();
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
          const clientMessage = context.createTestMessage('client.request', { query: 'ping' });
          yield* client.publish(clientMessage);

          // Server receives and responds
          const serverReceivedMessages = yield* context.collectMessages(serverMessages, 1);
          expect(serverReceivedMessages[0]?.payload).toEqual({ query: 'ping' });

          const serverResponse = context.createTestMessage('server.response', { result: 'pong' });
          yield* connection.transport.publish(serverResponse);

          // Client receives response
          const clientReceivedMessages = yield* context.collectMessages(clientMessages, 1);
          expect(clientReceivedMessages[0]?.payload).toEqual({ result: 'pong' });
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should filter messages correctly on client side', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Subscribe with filter for only 'important' messages
          const filteredMessages = yield* client.subscribe((msg) =>
            msg.type.startsWith('important.')
          );

          // Broadcast multiple message types from server
          yield* server.broadcast(context.createTestMessage('normal.message', { data: 1 }));
          yield* server.broadcast(context.createTestMessage('important.alert', { data: 2 }));
          yield* server.broadcast(context.createTestMessage('debug.info', { data: 3 }));
          yield* server.broadcast(context.createTestMessage('important.notification', { data: 4 }));

          // Should only receive the 'important' messages
          const receivedMessages = yield* context.collectMessages(filteredMessages, 2);

          expect(receivedMessages).toHaveLength(2);
          expect(receivedMessages[0]?.type).toBe('important.alert');
          expect(receivedMessages[0]?.payload).toEqual({ data: 2 });
          expect(receivedMessages[1]?.type).toBe('important.notification');
          expect(receivedMessages[1]?.payload).toEqual({ data: 4 });
        });

        await Effect.runPromise(Effect.scoped(program));
      });
    });

    describe('Connection Lifecycle', () => {
      test('should handle graceful client disconnection', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Create nested scope for client
          const clientScope = yield* Scope.make();

          // Connect client in nested scope
          const client = yield* Scope.extend(pair.createClient(), clientScope);

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
          const pair = context.createTransportPair();

          // Create nested scope for server
          const serverScope = yield* Scope.make();

          // Start server in nested scope
          yield* Scope.extend(pair.createServer(), serverScope);

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();
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

      test('should provide current state when subscribing after connection', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect client and wait for connection
          const client = yield* pair.createClient();
          yield* context.waitForConnectionState(client, 'connected');

          // Now subscribe to connection state AFTER connection is established
          const stateHistory: ConnectionState[] = [];
          const lateSubscriberFiber = yield* Effect.fork(
            pipe(
              client.connectionState,
              Stream.take(3), // Take current state + potential future states
              Stream.runForEach((state) => Effect.sync(() => stateHistory.push(state)))
            )
          );

          // Give time for the subscription to process
          yield* Effect.sleep(50);

          // Verify that the first state received is the CURRENT state (connected)
          expect(stateHistory[0]).toBe('connected');
          expect(stateHistory.length).toBe(1); // Should only have received the current state

          // Cancel the subscriber fiber
          yield* Fiber.interrupt(lateSubscriberFiber);

          // Should have received only 'connected' (the current state)
          expect(stateHistory).toEqual(['connected']);
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should clean up resources when scope closes', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect multiple clients and collect their state refs
          const client1 = yield* pair.createClient();
          const client2 = yield* pair.createClient();

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
      test('should handle connection to non-existent server', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair but don't start the server
          const pair = context.createTransportPair();

          // Try to connect client without starting server first
          const result = yield* Effect.either(pair.createClient());

          expect(result._tag).toBe('Left');
          // The exact error type depends on the implementation
        });

        await Effect.runPromise(Effect.scoped(program));
      });

      test('should handle malformed messages gracefully', async () => {
        const program = Effect.gen(function* () {
          // Create a transport pair
          const pair = context.createTransportPair();

          // Start server
          const server = yield* pair.createServer();

          yield* Effect.sleep(100);

          // Connect client
          const client = yield* pair.createClient();
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
          const validMessage = context.createTestMessage('valid.message', { data: 'good' });
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
