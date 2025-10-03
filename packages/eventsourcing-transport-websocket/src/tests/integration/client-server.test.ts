/**
 * WebSocket Client-Server Integration Tests
 *
 * Tests WebSocket-specific behaviors and uses the client-server contract tests
 * to verify compliance with the generic client-server transport interface.
 *
 * Uses real WebSocket connections with random ports to avoid conflicts.
 * All resources are properly managed through Effect Scope for deterministic cleanup.
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  makeTransportMessage,
  Server,
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

// Import the WebSocket implementations
import { WebSocketConnector } from '../../lib/websocket-transport';
import { WebSocketAcceptor } from '../../lib/websocket-server';

// =============================================================================
// WebSocket Test Context Implementation
// =============================================================================

const mapConnectionForContract = (conn: Server.ClientConnection) => ({
  id: String(conn.clientId),
  transport: {
    connectionState: conn.transport.connectionState,
    publish: (msg: TransportMessage) =>
      pipe(
        msg,
        conn.transport.publish,
        Effect.mapError(() => new Error('Failed to publish message'))
      ),
    subscribe: (filter?: (msg: TransportMessage) => boolean) =>
      pipe(
        filter,
        conn.transport.subscribe,
        Effect.mapError(() => new Error('Failed to subscribe'))
      ),
  } satisfies ClientTransport,
});

const mapServerTransportForContract = (transport: Server.Transport): ServerTransport => ({
  connections: pipe(transport.connections, Stream.map(mapConnectionForContract)),
  broadcast: (message: TransportMessage) =>
    pipe(
      message,
      transport.broadcast,
      Effect.mapError(() => new Error('Failed to broadcast'))
    ),
});

const mapClientTransportForContract = (transport: {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (msg: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}): ClientTransport => ({
  connectionState: transport.connectionState,
  publish: (msg: TransportMessage) =>
    pipe(
      msg,
      transport.publish,
      Effect.mapError(() => new Error('Failed to publish message'))
    ),
  subscribe: (filter?: (msg: TransportMessage) => boolean) =>
    pipe(
      filter,
      transport.subscribe,
      Effect.mapError(() => new Error('Failed to subscribe'))
    ),
});

const createWebSocketTestContext = (): Effect.Effect<ClientServerTestContext, never, never> =>
  Effect.succeed({
    makeTransportPair: (): TransportPair => {
      // Generate a random port for this pair
      const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const host = 'localhost';
      const url = `ws://${host}:${port}`;

      return {
        makeServer: () =>
          pipe(
            { port, host },
            WebSocketAcceptor.make,
            Effect.flatMap((acceptor) => acceptor.start()),
            Effect.map(mapServerTransportForContract)
          ),

        makeClient: () =>
          pipe(
            url,
            WebSocketConnector.connect,
            Effect.map(mapClientTransportForContract),
            Effect.mapError(() => new Error('Failed to connect to server'))
          ),
      };
    },

    waitForConnectionState: (
      transport: Readonly<ClientTransport>,
      expectedState: Readonly<ConnectionState>,
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

// Run the generic client-server contract tests for WebSocket implementation
runClientServerContractTests('WebSocket', createWebSocketTestContext);

// =============================================================================
// WebSocket-Specific Tests
// =============================================================================

const checkConnectionState = (client: {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
}) =>
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
  );

const connectAndVerify = (host: string, port: number) =>
  pipe(`ws://${host}:${port}`, WebSocketConnector.connect, Effect.flatMap(checkConnectionState));

describe('WebSocket Client-Server Specific Tests', () => {
  // WebSocket-specific tests that directly test the WebSocket implementation

  it.scoped('WebSocket server should accept connections on specified port', () => {
    const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
    const host = 'localhost';

    return pipe(
      { port, host },
      WebSocketAcceptor.make,
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((_server) => connectAndVerify(host, port))
    );
  });

  it.scoped('WebSocket connector should fail for invalid URLs', () => {
    // Test with non-existent server
    const nonExistentPort = Math.floor(Math.random() * (65535 - 49152) + 49152);

    return pipe(
      `ws://localhost:${nonExistentPort}`,
      WebSocketConnector.connect,
      Effect.either,
      Effect.tap((result) => {
        expect(result._tag).toBe('Left');
        return Effect.void;
      })
    );
  });
});
