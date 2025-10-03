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

const wrapPublish =
  (transport: { publish: (msg: TransportMessage) => Effect.Effect<void, unknown> }) =>
  (msg: TransportMessage) =>
    pipe(
      transport.publish(msg),
      Effect.mapError(() => new Error('Failed to publish message'))
    );

const wrapSubscribe =
  (transport: {
    subscribe: (
      filter?: (msg: TransportMessage) => boolean
    ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
  }) =>
  (filter?: (msg: TransportMessage) => boolean) =>
    pipe(
      transport.subscribe(filter),
      Effect.mapError(() => new Error('Failed to subscribe'))
    );

const wrapBroadcast =
  (transport: { broadcast: (message: TransportMessage) => Effect.Effect<void, unknown> }) =>
  (message: TransportMessage) =>
    pipe(
      transport.broadcast(message),
      Effect.mapError(() => new Error('Failed to broadcast'))
    );

const mapServerConnection = (conn: {
  clientId: string;
  transport: {
    connectionState: Stream.Stream<ConnectionState>;
    publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
    subscribe: (
      filter?: (msg: TransportMessage) => boolean
    ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
  };
}) => ({
  id: String(conn.clientId),
  transport: {
    connectionState: conn.transport.connectionState,
    publish: wrapPublish(conn.transport),
    subscribe: wrapSubscribe(conn.transport),
  } satisfies ClientTransport,
});

const mapServerConnections = (transport: InMemoryServer) =>
  pipe(transport.connections, Stream.map(mapServerConnection));

const createServerTransport = (transport: InMemoryServer): ServerTransport => ({
  connections: mapServerConnections(transport),
  broadcast: wrapBroadcast(transport),
});

const createClientTransport = (transport: {
  connectionState: Stream.Stream<ConnectionState>;
  publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
  subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
}): ClientTransport => ({
  connectionState: transport.connectionState,
  publish: wrapPublish(transport),
  subscribe: wrapSubscribe(transport),
});

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
            Effect.map(createServerTransport)
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
            Effect.map(createClientTransport),
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

  const verifyClientConnectionState = (client: {
    connectionState: Stream.Stream<ConnectionState>;
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

  it.effect('in-memory server should accept connections', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) => server.connector()),
      Effect.flatMap(verifyClientConnectionState),
      Effect.scoped
    )
  );

  it.effect('in-memory connector should always succeed with direct connection', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap((server) => server.connector()),
      Effect.flatMap(verifyClientConnectionState),
      Effect.scoped
    )
  );

  const getClientConnectionState = (client: { connectionState: Stream.Stream<ConnectionState> }) =>
    pipe(client.connectionState, Stream.take(1), Stream.runHead);

  const collectServerConnections = (server: InMemoryServer) =>
    pipe(
      server.connections,
      Stream.take(2),
      Stream.runCollect,
      Effect.map((chunk) => Array.from(chunk))
    );

  const verifyMultipleClientStates = (
    state1: { _tag: 'Some'; value: ConnectionState } | { _tag: 'None' },
    state2: { _tag: 'Some'; value: ConnectionState } | { _tag: 'None' },
    connections: Array<{ clientId: string }>
  ) =>
    Effect.sync(() => {
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
    });

  const verifyConnectionsAfterStates = (
    server: InMemoryServer,
    state1: { _tag: 'Some'; value: ConnectionState } | { _tag: 'None' },
    state2: { _tag: 'Some'; value: ConnectionState } | { _tag: 'None' }
  ) =>
    pipe(
      collectServerConnections(server),
      Effect.flatMap((connections) => verifyMultipleClientStates(state1, state2, connections))
    );

  const verifyTwoClientsConnected = (
    server: InMemoryServer,
    client1: { connectionState: Stream.Stream<ConnectionState> },
    client2: { connectionState: Stream.Stream<ConnectionState> }
  ) =>
    pipe(
      Effect.all([getClientConnectionState(client1), getClientConnectionState(client2)]),
      Effect.flatMap(([state1, state2]) => verifyConnectionsAfterStates(server, state1, state2))
    );

  const connectTwoClients = (server: InMemoryServer) =>
    pipe(
      Effect.all([server.connector(), server.connector()]),
      Effect.flatMap(([client1, client2]) => verifyTwoClientsConnected(server, client1, client2))
    );

  it.effect('multiple clients should be able to connect to the same in-memory server', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap(connectTwoClients),
      Effect.scoped
    )
  );

  const waitForConnected = (client: { connectionState: Stream.Stream<ConnectionState> }) =>
    pipe(
      client.connectionState,
      Stream.filter((state) => state === 'connected'),
      Stream.take(1),
      Stream.runDrain
    );

  const collectFirstMessage = (messageStream: Stream.Stream<TransportMessage>) =>
    pipe(
      messageStream,
      Stream.take(1),
      Stream.runCollect,
      Effect.map((chunk) => Array.from(chunk)),
      Effect.timeout(100)
    );

  const verifyTestMessage =
    (testMessage: TransportMessage) => (messages: Array<TransportMessage>) =>
      Effect.sync(() => {
        expect(messages).toHaveLength(1);
        expect(messages[0]!.id).toEqual(testMessage.id);
        expect(messages[0]!.type).toBe(testMessage.type);
      });

  const broadcastAndCollect = (
    server: InMemoryServer,
    testMessage: TransportMessage,
    messageStream: Stream.Stream<TransportMessage>
  ) =>
    pipe(
      server.broadcast(testMessage),
      Effect.flatMap(() => collectFirstMessage(messageStream)),
      Effect.flatMap(verifyTestMessage(testMessage))
    );

  const subscribeAndTest = (
    server: InMemoryServer,
    client: {
      connectionState: Stream.Stream<ConnectionState>;
      subscribe: () => Effect.Effect<Stream.Stream<TransportMessage>, Error>;
    },
    testMessage: TransportMessage
  ) =>
    pipe(
      waitForConnected(client),
      Effect.flatMap(() => client.subscribe()),
      Effect.flatMap((messageStream) => broadcastAndCollect(server, testMessage, messageStream))
    );

  const testInstantMessageDelivery = (server: InMemoryServer, testMessage: TransportMessage) =>
    pipe(
      server.connector(),
      Effect.flatMap((client) => subscribeAndTest(server, client, testMessage))
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
      Effect.flatMap((server) => testInstantMessageDelivery(server, testMessage)),
      Effect.scoped
    );
  });
});
