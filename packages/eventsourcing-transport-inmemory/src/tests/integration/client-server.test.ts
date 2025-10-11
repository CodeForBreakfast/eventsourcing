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
import { Effect, Stream, pipe, Option } from 'effect';
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
  (transport: { readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown> }) =>
  (msg: TransportMessage) =>
    pipe(
      msg,
      transport.publish,
      Effect.mapError(() => new Error('Failed to publish message'))
    );

const wrapSubscribe =
  (transport: {
    readonly subscribe: (
      filter?: (msg: TransportMessage) => boolean
    ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
  }) =>
  (filter?: (msg: TransportMessage) => boolean) =>
    pipe(
      filter,
      transport.subscribe,
      Effect.mapError(() => new Error('Failed to subscribe'))
    );

const wrapBroadcast =
  (transport: {
    readonly broadcast: (message: TransportMessage) => Effect.Effect<void, unknown>;
  }) =>
  (message: TransportMessage) =>
    pipe(
      message,
      transport.broadcast,
      Effect.mapError(() => new Error('Failed to broadcast'))
    );

const mapServerConnection = (conn: {
  readonly clientId: string;
  readonly transport: {
    readonly connectionState: Stream.Stream<ConnectionState>;
    readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
    readonly subscribe: (
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
  readonly connectionState: Stream.Stream<ConnectionState>;
  readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
  readonly subscribe: (
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
            () =>
              !serverInstance
                ? (() => {
                    throw new Error('Server must be created before client');
                  })()
                : serverInstance,
            Effect.sync,
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

  const expectStateConnected = (state: Readonly<Option.Option<ConnectionState>>) =>
    Option.match(state, {
      onNone: () => Effect.void,
      onSome: (value) => Effect.sync(() => expect(value).toBe('connected')),
    });

  const verifyClientConnectionState = (client: {
    readonly connectionState: Stream.Stream<ConnectionState>;
  }) =>
    pipe(
      client.connectionState,
      Stream.take(1),
      Stream.runHead,
      Effect.tap((state) => {
        expect(Option.isSome(state)).toBe(true);
        return expectStateConnected(state);
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

  const getClientConnectionState = (client: {
    readonly connectionState: Stream.Stream<ConnectionState>;
  }) => pipe(client.connectionState, Stream.take(1), Stream.runHead);

  const collectServerConnections = (server: InMemoryServer) =>
    pipe(
      server.connections,
      Stream.take(2),
      Stream.runCollect,
      // eslint-disable-next-line effect/no-eta-expansion -- Lambda preserves type information for TypeScript inference
      Effect.map((chunk) => Array.from(chunk))
    );

  const verifyWithBothStates =
    (
      state1: Readonly<Option.Option<ConnectionState>>,
      state2: Readonly<Option.Option<ConnectionState>>
    ) =>
    (connections: ReadonlyArray<{ readonly clientId: string }>) =>
      Effect.sync(() => {
        expect(Option.isSome(state1)).toBe(true);
        expect(Option.isSome(state2)).toBe(true);
        if (Option.isSome(state1) && Option.isSome(state2)) {
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
    state1: Readonly<Option.Option<ConnectionState>>,
    state2: Readonly<Option.Option<ConnectionState>>
  ) => pipe(server, collectServerConnections, Effect.flatMap(verifyWithBothStates(state1, state2)));

  const verifyTwoClientsConnected = (
    server: InMemoryServer,
    client1: { readonly connectionState: Stream.Stream<ConnectionState> },
    client2: { readonly connectionState: Stream.Stream<ConnectionState> }
  ) =>
    pipe(
      [getClientConnectionState(client1), getClientConnectionState(client2)] as const,
      Effect.all,
      Effect.flatMap(([state1, state2]) => verifyConnectionsAfterStates(server, state1, state2))
    );

  const connectTwoClients = (server: InMemoryServer) =>
    pipe(
      [server.connector(), server.connector()] as const,
      Effect.all,
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

  const waitForConnected = (client: { readonly connectionState: Stream.Stream<ConnectionState> }) =>
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
      // eslint-disable-next-line effect/no-eta-expansion -- Lambda preserves type information for TypeScript inference
      Effect.map((chunk) => Array.from(chunk)),
      Effect.timeout(100)
    );

  const verifyTestMessage =
    (testMessage: TransportMessage) => (messages: ReadonlyArray<TransportMessage>) =>
      Effect.sync(() => {
        expect(messages).toHaveLength(1);
        expect(messages[0]!.id).toEqual(testMessage.id);
        expect(messages[0]!.type).toBe(testMessage.type);
      });

  const collectWithServerAndMessage =
    (server: InMemoryServer, testMessage: TransportMessage) =>
    (messageStream: Stream.Stream<TransportMessage>) =>
      pipe(
        testMessage,
        server.broadcast,
        Effect.andThen(collectFirstMessage(messageStream)),
        Effect.flatMap(verifyTestMessage(testMessage))
      );

  const testWithServerAndMessage =
    (server: InMemoryServer, testMessage: TransportMessage) =>
    (client: {
      readonly connectionState: Stream.Stream<ConnectionState>;
      readonly subscribe: () => Effect.Effect<Stream.Stream<TransportMessage>, Error>;
    }) =>
      pipe(
        client,
        waitForConnected,
        Effect.andThen(client.subscribe()),
        Effect.flatMap(collectWithServerAndMessage(server, testMessage))
      );

  const testInstantMessageDelivery = (testMessage: TransportMessage) => (server: InMemoryServer) =>
    pipe(server.connector(), Effect.flatMap(testWithServerAndMessage(server, testMessage)));

  it.effect('in-memory transport should support instant message delivery', () => {
    const testMessage = makeTransportMessage(
      'test-123',
      'test-type',
      JSON.stringify({ data: 'test' })
    );

    return pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start()),
      Effect.flatMap(testInstantMessageDelivery(testMessage)),
      Effect.scoped
    );
  });
});
