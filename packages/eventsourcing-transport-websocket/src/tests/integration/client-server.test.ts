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
import { Effect, Stream, pipe, Option } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  makeTransportMessage,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  runClientServerContractTests,
  type ClientServerTestContext,
  type ServerConfig,
  type ClientTransport,
  type ServerTransport,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// Import the WebSocket implementations
import { WebSocketConnector } from '../../lib/websocket-transport';
import { WebSocketAcceptor } from '../../lib/websocket-server';

// =============================================================================
// WebSocket Test Context Implementation
// =============================================================================

const createWebSocketTestContext = (): Effect.Effect<ClientServerTestContext> =>
  Effect.succeed({
    createServer: (config: ServerConfig) =>
      pipe(
        WebSocketAcceptor.make(config),
        Effect.flatMap((acceptor) => acceptor.start()),
        Effect.map(
          (transport): ServerTransport => ({
            start: () => Effect.void,
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

    createClient: (url: string) =>
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

    generateTestUrl: (config: ServerConfig) => `ws://${config.host}:${config.port}`,

    waitForConnectionState: (
      transport: ClientTransport,
      expectedState: ConnectionState,
      timeoutMs: number = 5000
    ) =>
      pipe(
        transport.connectionState,
        Stream.filter((state) => state === expectedState),
        Stream.take(1),
        Stream.runDrain,
        Effect.timeout(timeoutMs),
        Effect.mapError(() => new Error(`Timeout waiting for connection state: ${expectedState}`))
      ),

    collectMessages: <T>(
      stream: Stream.Stream<T, never, never>,
      count: number,
      timeoutMs: number = 5000
    ) =>
      pipe(
        stream,
        Stream.take(count),
        Stream.runCollect,
        Effect.map((chunk) => Array.from(chunk)),
        Effect.timeout(timeoutMs),
        Effect.mapError(() => new Error(`Timeout collecting ${count} messages`))
      ),

    createTestMessage: (type: string, payload: unknown) =>
      makeTransportMessage(`test-${Date.now()}-${Math.random()}`, type, payload),
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
  // WebSocket-specific tests would go here if there are any behaviors
  // that are unique to WebSocket and not covered by the generic contract tests.

  test('should use WebSocket protocol URLs', async () => {
    const context = await Effect.runPromise(createWebSocketTestContext());
    const url = context.generateTestUrl({ port: 8080, host: 'localhost' });

    expect(url).toBe('ws://localhost:8080');
    expect(url.startsWith('ws://')).toBe(true);
  });

  test('should handle WebSocket-specific connection failures', async () => {
    const context = await Effect.runPromise(createWebSocketTestContext());

    // Test connection to non-existent local WebSocket server
    const program = Effect.gen(function* () {
      const nonExistentPort = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const result = yield* Effect.either(
        context.createClient(`ws://localhost:${nonExistentPort}`)
      );

      expect(result._tag).toBe('Left');
    });

    await Effect.runPromise(Effect.scoped(program));
  });
});
