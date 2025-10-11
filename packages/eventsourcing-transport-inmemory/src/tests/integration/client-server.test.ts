/**
 * In-Memory Client-Server Integration Tests
 *
 * Tests in-memory transport specific behaviors and uses the client-server contract tests
 * to verify compliance with the generic client-server transport interface.
 *
 * Uses unique server IDs to avoid conflicts between test runs.
 * All resources are properly managed through Effect Scope for deterministic cleanup.
 */

import { describe, it, expectSome, assertEqual, expectTrue } from '@codeforbreakfast/buntest';
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
    pipe(state, expectSome, Effect.flatMap(assertEqual('connected')));

  const verifyClientConnectionState = (client: {
    readonly connectionState: Stream.Stream<ConnectionState>;
  }) =>
    pipe(
      client.connectionState,
      Stream.take(1),
      Stream.runHead,
      Effect.flatMap(expectStateConnected)
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

  const assertStateIsConnected = assertEqual('connected');

  const assertHasTwoConnections = expectTrue('Expected 2 connections');

  const assertFirstClientIdDefined = expectTrue('Expected first clientId to be defined');

  const assertSecondClientIdDefined = expectTrue('Expected second clientId to be defined');

  const assertDifferentClientIds = expectTrue('Expected different clientIds');

  const verifyBothStatesConnected = (states: readonly [ConnectionState, ConnectionState]) =>
    pipe(
      states[0],
      assertStateIsConnected,
      // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
      Effect.andThen(pipe(states[1], assertStateIsConnected))
    );

  const verifyConnectionsArray = (connections: ReadonlyArray<{ readonly clientId: string }>) =>
    pipe(
      connections.length === 2,
      assertHasTwoConnections,
      // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
      Effect.andThen(pipe(connections[0]!.clientId !== undefined, assertFirstClientIdDefined)),
      // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
      Effect.andThen(pipe(connections[1]!.clientId !== undefined, assertSecondClientIdDefined)),
      // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
      Effect.andThen(
        pipe(connections[0]!.clientId !== connections[1]!.clientId, assertDifferentClientIds)
      )
    );

  const verifyConnectionsAfterStates =
    (states: readonly [ConnectionState, ConnectionState]) =>
    (connections: ReadonlyArray<{ readonly clientId: string }>) =>
      pipe(states, verifyBothStatesConnected, Effect.andThen(verifyConnectionsArray(connections)));

  const verifyServerWithStates =
    (server: InMemoryServer) => (states: readonly [ConnectionState, ConnectionState]) =>
      pipe(server, collectServerConnections, Effect.flatMap(verifyConnectionsAfterStates(states)));

  const unwrapAndVerifyStates =
    (server: InMemoryServer) =>
    (optionStates: readonly [Option.Option<ConnectionState>, Option.Option<ConnectionState>]) =>
      pipe(
        [expectSome(optionStates[0]), expectSome(optionStates[1])] as const,
        Effect.all,
        Effect.flatMap(verifyServerWithStates(server))
      );

  const verifyTwoClientsConnected = (
    server: InMemoryServer,
    client1: { readonly connectionState: Stream.Stream<ConnectionState> },
    client2: { readonly connectionState: Stream.Stream<ConnectionState> }
  ) =>
    pipe(
      [getClientConnectionState(client1), getClientConnectionState(client2)] as const,
      Effect.all,
      Effect.flatMap(unwrapAndVerifyStates(server))
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

  const assertHasOneMessage = expectTrue('Expected 1 message');

  const verifyTestMessage =
    (testMessage: TransportMessage) => (messages: ReadonlyArray<TransportMessage>) =>
      pipe(
        messages.length === 1,
        assertHasOneMessage,
        // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
        Effect.andThen(pipe(messages[0]!.id, assertEqual(testMessage.id))),
        // eslint-disable-next-line effect/no-nested-pipes, effect/no-nested-pipe -- Nested pipe required to apply curried assertion function
        Effect.andThen(pipe(messages[0]!.type, assertEqual(testMessage.type)))
      );

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
