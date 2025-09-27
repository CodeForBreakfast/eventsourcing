/**
 * In-Memory Client-Server Integration Tests
 *
 * Tests in-memory transport specific behaviors and uses the client-server contract tests
 * to verify compliance with the generic client-server transport interface.
 *
 * Uses unique server IDs to avoid conflicts between test runs.
 * All resources are properly managed through Effect Scope for deterministic cleanup.
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  makeTransportMessage,
} from '@codeforbreakfast/eventsourcing-transport';
import {
  runClientServerContractTests,
  type ClientServerTestContext,
  type TransportPair,
  type ClientTransport,
  type ServerTransport,
  waitForConnectionState as defaultWaitForConnectionState,
  collectMessages as defaultCollectMessages,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// Import the in-memory implementations
import { InMemoryAcceptor, type InMemoryServer } from '../../lib/inmemory-transport';

// =============================================================================
// In-Memory Test Context Implementation
// =============================================================================

const createInMemoryTestContext = (): Effect.Effect<ClientServerTestContext, never, never> =>
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

    makeTestMessage: (type: string, payload: unknown) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      return makeTransportMessage(id, type, JSON.stringify(payload));
    },
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

  it.effect('in-memory server should accept connections', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) => server.connector()),
      Effect.flatMap((client) =>
        pipe(
          client.connectionState,
          Stream.take(1),
          Stream.runHead,
          Effect.tap((state) => {
            expect(state._tag).toBe('Some');
            if (state._tag === 'Some') {
              expect(state.value).toBe('connected');
            }
            return Effect.void;
          })
        )
      ),
      Effect.scoped
    )
  );

  it.effect('in-memory connector should always succeed with direct connection', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) => server.connector()),
      Effect.flatMap((client) =>
        pipe(
          client.connectionState,
          Stream.take(1),
          Stream.runHead,
          Effect.tap((state) => {
            expect(state._tag).toBe('Some');
            if (state._tag === 'Some') {
              expect(state.value).toBe('connected');
            }
            return Effect.void;
          })
        )
      ),
      Effect.scoped
    )
  );

  it.effect('multiple clients should be able to connect to the same in-memory server', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) =>
        pipe(
          Effect.all([server.connector(), server.connector()]),
          Effect.flatMap(([client1, client2]) =>
            pipe(
              Effect.all([
                pipe(client1.connectionState, Stream.take(1), Stream.runHead),
                pipe(client2.connectionState, Stream.take(1), Stream.runHead),
              ]),
              Effect.flatMap(([state1, state2]) =>
                pipe(
                  server.connections,
                  Stream.take(2),
                  Stream.runCollect,
                  Effect.map((chunk) => Array.from(chunk)),
                  Effect.tap((connections) => {
                    expect(state1._tag).toBe('Some');
                    expect(state2._tag).toBe('Some');
                    if (state1._tag === 'Some' && state2._tag === 'Some') {
                      expect(state1.value).toBe('connected');
                      expect(state2.value).toBe('connected');
                    }
                    expect(connections).toHaveLength(2);
                    expect(connections[0]!.clientId).toBeDefined();
                    expect(connections[1]!.clientId).toBeDefined();
                    expect(connections[0]!.clientId).not.toBe(connections[1]!.clientId);
                    return Effect.void;
                  })
                )
              )
            )
          )
        )
      ),
      Effect.scoped
    )
  );

  it.effect('in-memory transport should support instant message delivery', () => {
    const testMessage = makeTransportMessage(
      'test-123',
      'test-type',
      JSON.stringify({ data: 'test' })
    );

    return pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) =>
        pipe(
          server.connector(),
          Effect.flatMap((client) =>
            pipe(
              // Wait for connection
              client.connectionState,
              Stream.filter((state) => state === 'connected'),
              Stream.take(1),
              Stream.runDrain,
              Effect.flatMap(() => client.subscribe()),
              Effect.flatMap((messageStream) =>
                pipe(
                  // Send message via broadcast (should be instant for in-memory)
                  server.broadcast(testMessage),
                  Effect.flatMap(() =>
                    // Collect the message (should arrive immediately)
                    pipe(
                      messageStream,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.map((chunk) => Array.from(chunk)),
                      Effect.timeout(100), // Very short timeout since it should be instant
                      Effect.tap((messages) => {
                        expect(messages).toHaveLength(1);
                        expect(messages[0]!.id).toEqual(testMessage.id);
                        expect(messages[0]!.type).toBe(testMessage.type);
                        return Effect.void;
                      })
                    )
                  )
                )
              )
            )
          )
        )
      ),
      Effect.scoped
    );
  });
});
