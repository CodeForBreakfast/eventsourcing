/**
 * WebSocket Client-Server Integration Tests
 *
 * Tests WebSocket-specific behaviors and uses the client-server contract tests
 * to verify compliance with the generic client-server transport interface.
 *
 * Uses real WebSocket connections with random ports to avoid conflicts.
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

// Import the WebSocket implementations
import { WebSocketConnector } from '../../lib/websocket-transport';
import { WebSocketAcceptor } from '../../lib/websocket-server';

// =============================================================================
// WebSocket Test Context Implementation
// =============================================================================

const createWebSocketTestContext = (): Effect.Effect<ClientServerTestContext> =>
  Effect.succeed({
    makeTransportPair: (): TransportPair => {
      // Generate a random port for this pair
      const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const host = 'localhost';
      const url = `ws://${host}:${port}`;

      return {
        makeServer: () =>
          pipe(
            WebSocketAcceptor.make({ port, host }),
            Effect.flatMap((acceptor) => acceptor.start()),
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
            WebSocketConnector.connect(url),
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

// Run the generic client-server contract tests for WebSocket implementation
runClientServerContractTests('WebSocket', createWebSocketTestContext);

// =============================================================================
// WebSocket-Specific Tests
// =============================================================================

describe('WebSocket Client-Server Specific Tests', () => {
  // WebSocket-specific tests that directly test the WebSocket implementation

  test('WebSocket server should accept connections on specified port', async () => {
    const program = Effect.gen(function* () {
      const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const host = 'localhost';

      // Create WebSocket server directly
      const acceptor = yield* WebSocketAcceptor.make({ port, host });
      yield* acceptor.start();

      // Create WebSocket client directly
      const client = yield* WebSocketConnector.connect(`ws://${host}:${port}`);

      // Verify connection state
      const state = yield* pipe(client.connectionState, Stream.take(1), Stream.runHead);

      expect(state._tag).toBe('Some');
      if (state._tag === 'Some') {
        expect(state.value).toBe('connected');
      }
    });

    await Effect.runPromise(Effect.scoped(program));
  });

  test('WebSocket connector should fail for invalid URLs', async () => {
    const program = Effect.gen(function* () {
      // Test with non-existent server
      const nonExistentPort = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const result = yield* Effect.either(
        WebSocketConnector.connect(`ws://localhost:${nonExistentPort}`)
      );

      expect(result._tag).toBe('Left');
    });

    await Effect.runPromise(Effect.scoped(program));
  });
});
