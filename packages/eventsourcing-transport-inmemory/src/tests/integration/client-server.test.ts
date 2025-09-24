/**
 * In-Memory Client-Server Integration Tests
 *
 * Tests in-memory transport specific behaviors and uses the client-server contract tests
 * to verify compliance with the generic client-server transport interface.
 *
 * Uses unique server IDs to avoid conflicts between test runs.
 * All resources are properly managed through Effect Scope for deterministic cleanup.
 */

import { describe, test, expect } from 'bun:test';
import { Effect, Stream, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  runClientServerContractTests,
  type ClientServerTestContext,
  type TransportPair,
  type ClientTransport,
  type ServerTransport,
  waitForConnectionState as defaultWaitForConnectionState,
  collectMessages as defaultCollectMessages,
  makeTestMessage as defaultCreateTestMessage,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// Import the in-memory implementations
import { InMemoryAcceptor, type InMemoryServer } from '../../lib/inmemory-transport';

// =============================================================================
// In-Memory Test Context Implementation
// =============================================================================

const createInMemoryTestContext = (): Effect.Effect<ClientServerTestContext> =>
  Effect.succeed({
    makeTransportPair: (): TransportPair => {
      // Direct in-memory connection with no configuration needed

      // Shared server instance for this transport pair
      let serverInstance: InMemoryServer | null = null;

      return {
        makeServer: () =>
          pipe(
            InMemoryAcceptor.make(),
            Effect.flatMap((acceptor) => acceptor.start()),
            Effect.tap((server) =>
              Effect.sync(() => {
                serverInstance = server;
              })
            ),
            Effect.map(
              (transport): ServerTransport => ({
                connections: pipe(
                  transport.connections,
                  Stream.map((conn) => ({
                    id: String(conn.clientId),
                    transport: {
                      connectionState: conn.transport.connectionState,
                      publish: (msg: TransportMessage) =>
                        conn.transport
                          .publish(msg)
                          .pipe(Effect.mapError(() => new Error('Failed to publish message'))),
                      subscribe: (filter?: (msg: TransportMessage) => boolean) =>
                        conn.transport
                          .subscribe(filter)
                          .pipe(Effect.mapError(() => new Error('Failed to subscribe'))),
                    } satisfies ClientTransport,
                  }))
                ),
                broadcast: (message: TransportMessage) =>
                  transport
                    .broadcast(message)
                    .pipe(Effect.mapError(() => new Error('Failed to broadcast'))),
              })
            )
          ),

        makeClient: () =>
          pipe(
            Effect.sync(() => {
              if (!serverInstance) {
                throw new Error('Server must be created before client');
              }
              return serverInstance;
            }),
            Effect.flatMap((server) => server.connector()),
            Effect.map(
              (transport): ClientTransport => ({
                connectionState: transport.connectionState,
                publish: (msg: TransportMessage) =>
                  transport
                    .publish(msg)
                    .pipe(Effect.mapError(() => new Error('Failed to publish message'))),
                subscribe: (filter?: (msg: TransportMessage) => boolean) =>
                  transport
                    .subscribe(filter)
                    .pipe(Effect.mapError(() => new Error('Failed to subscribe'))),
              })
            ),
            Effect.mapError(() => new Error('Failed to connect to server'))
          ),
      };
    },

    waitForConnectionState: (
      transport: ClientTransport,
      expectedState: ConnectionState,
      timeoutMs?: number
    ) => defaultWaitForConnectionState(transport.connectionState, expectedState, timeoutMs),

    collectMessages: defaultCollectMessages,

    makeTestMessage: defaultCreateTestMessage,
  });

// =============================================================================
// Contract Tests
// =============================================================================

// Run the generic client-server contract tests for in-memory implementation
runClientServerContractTests('InMemory', createInMemoryTestContext);

// =============================================================================
// In-Memory Specific Tests
// =============================================================================

describe('In-Memory Client-Server Specific Tests', () => {
  // In-memory specific tests that directly test the in-memory implementation

  test('in-memory server should accept connections', async () => {
    const program = Effect.gen(function* () {
      // Create in-memory server directly
      const acceptor = yield* InMemoryAcceptor.make();
      const server = yield* acceptor.start();

      // Create in-memory client directly using the server's connector
      const client = yield* server.connector();

      // Verify connection state
      const state = yield* pipe(client.connectionState, Stream.take(1), Stream.runHead);

      expect(state._tag).toBe('Some');
      if (state._tag === 'Some') {
        expect(state.value).toBe('connected');
      }
    });

    await Effect.runPromise(Effect.scoped(program));
  });

  test('in-memory connector should always succeed with direct connection', async () => {
    const program = Effect.gen(function* () {
      // Create a server first
      const acceptor = yield* InMemoryAcceptor.make();
      const server = yield* acceptor.start();

      // Test that connector always succeeds (no URL validation)
      const client = yield* server.connector();
      const state = yield* pipe(client.connectionState, Stream.take(1), Stream.runHead);

      expect(state._tag).toBe('Some');
      if (state._tag === 'Some') {
        expect(state.value).toBe('connected');
      }
    });

    await Effect.runPromise(Effect.scoped(program));
  });

  test('multiple clients should be able to connect to the same in-memory server', async () => {
    const program = Effect.gen(function* () {
      // Create server
      const acceptor = yield* InMemoryAcceptor.make();
      const server = yield* acceptor.start();

      // Create multiple clients using the server's connector
      const client1 = yield* server.connector();
      const client2 = yield* server.connector();

      // Verify both clients are connected
      const state1 = yield* pipe(client1.connectionState, Stream.take(1), Stream.runHead);
      const state2 = yield* pipe(client2.connectionState, Stream.take(1), Stream.runHead);

      expect(state1._tag).toBe('Some');
      expect(state2._tag).toBe('Some');
      if (state1._tag === 'Some' && state2._tag === 'Some') {
        expect(state1.value).toBe('connected');
        expect(state2.value).toBe('connected');
      }

      // Test that server can see both connections
      const connections = yield* pipe(
        server.connections,
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => Array.from(chunk))
      );

      expect(connections).toHaveLength(2);
      expect(connections[0]!.clientId).toBeDefined();
      expect(connections[1]!.clientId).toBeDefined();
      expect(connections[0]!.clientId).not.toBe(connections[1]!.clientId);
    });

    await Effect.runPromise(Effect.scoped(program));
  });

  test('in-memory transport should support instant message delivery', async () => {
    const program = Effect.gen(function* () {
      // Create server and client
      const acceptor = yield* InMemoryAcceptor.make();
      const server = yield* acceptor.start();
      const client = yield* server.connector();

      // Wait for connection
      yield* pipe(
        client.connectionState,
        Stream.filter((state) => state === 'connected'),
        Stream.take(1),
        Stream.runDrain
      );

      // Set up message subscription
      const messageStream = yield* client.subscribe();
      const testMessage = defaultCreateTestMessage('test-type', { data: 'test' });

      // Send message via broadcast (should be instant for in-memory)
      yield* server.broadcast(testMessage);

      // Collect the message (should arrive immediately)
      const messages = yield* pipe(
        messageStream,
        Stream.take(1),
        Stream.runCollect,
        Effect.map((chunk) => Array.from(chunk)),
        Effect.timeout(100) // Very short timeout since it should be instant
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe(testMessage.id);
      expect(messages[0]!.type).toBe(testMessage.type);
    });

    await Effect.runPromise(Effect.scoped(program));
  });
});
