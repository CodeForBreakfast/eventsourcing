import { describe, expect, it } from '@codeforbreakfast/buntest';
import { Effect, Stream, Duration, pipe, TestClock, TestContext, Either, Schema } from 'effect';
import {
  ProtocolLive,
  sendWireCommand,
  subscribe,
  WireCommandTimeoutError,
  Event,
} from './protocol';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { ServerProtocolLive, ServerProtocol } from './server-protocol';
import {
  InMemoryAcceptor,
  type InMemoryServer,
} from '@codeforbreakfast/eventsourcing-transport-inmemory';
import {
  makeTransportMessage,
  type TransportMessage,
  Server,
} from '@codeforbreakfast/eventsourcing-transport';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { type ReadonlyDeep } from 'type-fest';

// ============================================================================
// Test Helpers
// ============================================================================

const unsafeCreateStreamId = (id: string) => pipe(id, Schema.decodeUnknownSync(EventStreamId));

// ============================================================================
// Test Environment Setup
// ============================================================================

const waitForConnectedState = (
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    clientTransport.connectionState,
    Stream.filter((state) => state === 'connected'),
    Stream.take(1),
    Stream.runDrain
  );

const asServerAndClient =
  (server: ReadonlyDeep<InMemoryServer>) =>
  (clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
    pipe(waitForConnectedState(clientTransport), Effect.as({ server, clientTransport }));

const connectClientToServer = (server: ReadonlyDeep<InMemoryServer>) =>
  pipe(server.connector(), Effect.flatMap(asServerAndClient(server)));

const setupTestEnvironment = pipe(
  InMemoryAcceptor.make(),
  Effect.flatMap((acceptor) => acceptor.start()),
  Effect.flatMap(connectClientToServer)
);

// ============================================================================
// Test Server Protocol - Handles WireCommands and Subscriptions
// ============================================================================

type ParsedMessage = {
  readonly type: string;
  readonly id?: string;
  readonly streamId?: string;
  readonly target?: string;
  readonly name?: string;
  readonly payload?: unknown;
  readonly [key: string]: unknown;
};

const handleCommandMessage = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  parsedMessage: ParsedMessage
) => {
  if (
    parsedMessage.type === 'command' &&
    parsedMessage.id &&
    parsedMessage.target &&
    parsedMessage.name &&
    parsedMessage.payload !== undefined
  ) {
    const command: WireCommand = {
      id: parsedMessage.id,
      target: parsedMessage.target,
      name: parsedMessage.name,
      payload: parsedMessage.payload,
    };
    const result = commandHandler(command);
    const response = makeTransportMessage(
      crypto.randomUUID(),
      'command_result',
      JSON.stringify({
        type: 'command_result',
        commandId: command.id,
        success: result._tag === 'Success',
        ...(result._tag === 'Success'
          ? { position: result.position }
          : { error: JSON.stringify(result.error) }),
      })
    );
    return server.broadcast(response);
  }
  return Effect.void;
};

const handleSubscriptionMessage = (
  server: ReadonlyDeep<InMemoryServer>,
  subscriptionHandler: (streamId: string) => readonly Event[],
  parsedMessage: ParsedMessage
) => {
  if (parsedMessage.type === 'subscribe' && parsedMessage.streamId) {
    const events = subscriptionHandler(parsedMessage.streamId);
    return Effect.forEach(
      events,
      (event) =>
        server.broadcast(
          makeTransportMessage(
            crypto.randomUUID(),
            'event',
            JSON.stringify({
              type: 'event',
              streamId: parsedMessage.streamId,
              position: event.position,
              eventType: event.type,
              data: event.data,
              timestamp: event.timestamp.toISOString(),
            })
          )
        ),
      { discard: true }
    );
  }
  return Effect.void;
};

const handleParsedMessage = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  parsedMessage: ParsedMessage
) => {
  const commandEffect = handleCommandMessage(server, commandHandler, parsedMessage);
  const subscriptionEffect = handleSubscriptionMessage(server, subscriptionHandler, parsedMessage);

  if (parsedMessage.type === 'command') {
    return commandEffect;
  }
  if (parsedMessage.type === 'subscribe') {
    return subscriptionEffect;
  }
  return Effect.void;
};

const parseAndHandleMessage = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  message: ReadonlyDeep<TransportMessage>
) =>
  pipe(
    Effect.try(() => JSON.parse(message.payload as string)),
    Effect.flatMap((parsedMessage: ParsedMessage) =>
      handleParsedMessage(server, commandHandler, subscriptionHandler, parsedMessage)
    ),
    Effect.catchAll(() => Effect.void)
  );

const processMessageStream = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  messageStream: ReadonlyDeep<Stream.Stream<TransportMessage>>
) =>
  Effect.forkScoped(
    Stream.runForEach(messageStream, (message: ReadonlyDeep<TransportMessage>) =>
      parseAndHandleMessage(server, commandHandler, subscriptionHandler, message)
    )
  );

const setupServerConnectionHandler = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  serverConnection: ReadonlyDeep<Server.ClientConnection>
) =>
  pipe(
    serverConnection.transport.subscribe(),
    Effect.flatMap((messageStream: ReadonlyDeep<Stream.Stream<TransportMessage>>) =>
      processMessageStream(server, commandHandler, subscriptionHandler, messageStream)
    )
  );

const getFirstConnection = (connections: ReadonlyDeep<Iterable<Server.ClientConnection>>) =>
  Array.from(connections)[0]!;

const createTestServerProtocol = (
  server: ReadonlyDeep<InMemoryServer>,

  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult = () => ({
    _tag: 'Success',
    position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
  }),
  subscriptionHandler: (streamId: string) => readonly Event[] = () => []
) =>
  pipe(
    server.connections,
    Stream.take(1),
    Stream.runCollect,
    Effect.map(getFirstConnection),
    Effect.flatMap((serverConnection: ReadonlyDeep<Server.ClientConnection>) =>
      setupServerConnectionHandler(server, commandHandler, subscriptionHandler, serverConnection)
    ),
    Effect.asVoid
  );

// ============================================================================
// Test Helper Functions
// ============================================================================

const verifySuccessResult = (streamId: string, eventNumber: number) => (result: CommandResult) =>
  Effect.sync(() => {
    expect(result._tag).toBe('Success');
    if (result._tag === 'Success') {
      expect(result.position.streamId).toEqual(unsafeCreateStreamId(streamId));
      expect(result.position.eventNumber).toBe(eventNumber);
    }
  });

const verifyFailureResult =
  (expectedErrorTag: string, expectedErrors?: readonly string[]) => (result: CommandResult) =>
    Effect.sync(() => {
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.error._tag).toBe('UnknownError');
        if (result.error._tag === 'UnknownError') {
          const parsedError = JSON.parse(result.error.message);
          expect(parsedError._tag).toBe(expectedErrorTag);
          if (expectedErrors) {
            expect(parsedError.validationErrors).toEqual(expectedErrors);
          }
        }
      }
    });

const sendCommandWithVerification = (
  command: ReadonlyDeep<WireCommand>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
  verify: (result: CommandResult) => Effect.Effect<void>
) =>
  pipe(
    sendWireCommand(command),
    Effect.tap(verify),
    Effect.provide(ProtocolLive(clientTransport)),
    Effect.asVoid
  );

const sendMultipleCommands = (
  commands: readonly WireCommand[],
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    Effect.all(commands.map(sendWireCommand), { concurrency: 'unbounded' }),
    Effect.provide(ProtocolLive(clientTransport))
  );

const verifyMultipleResults =
  (expectedTags: readonly ('Success' | 'Failure')[]) => (results: readonly CommandResult[]) =>
    Effect.sync(() => {
      expect(results).toHaveLength(expectedTags.length);
      expectedTags.forEach((expectedTag, index) => {
        expect(results[index]!._tag).toBe(expectedTag);
      });
    });

const sendCommandAsEither = (
  command: ReadonlyDeep<WireCommand>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) => pipe(sendWireCommand(command), Effect.either, Effect.provide(ProtocolLive(clientTransport)));

const raceCommandWithTimeout = (
  command: ReadonlyDeep<WireCommand>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
  timeoutSeconds: number
) =>
  pipe(
    Effect.all(
      [
        sendCommandAsEither(command, clientTransport),
        TestClock.adjust(Duration.seconds(timeoutSeconds)),
      ],
      { concurrency: 'unbounded' }
    ),
    Effect.map(([result, _]) => result)
  );

const verifyTimeoutError =
  (commandId: string) => (result: ReadonlyDeep<Either.Either<CommandResult, unknown>>) =>
    Effect.sync(() => {
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(WireCommandTimeoutError);
        if (result.left instanceof WireCommandTimeoutError) {
          expect(result.left.commandId).toBe(commandId);
          expect(result.left.timeoutMs).toBe(10000);
        }
      }
    });

const drainEventStream = <E, R>(eventStream: Stream.Stream<Event, E, R>) =>
  pipe(eventStream, Stream.take(0), Stream.runDrain);

const collectEventStream =
  <E, R>(count: number) =>
  (eventStream: Stream.Stream<Event, E, R>) =>
    pipe(eventStream, Stream.take(count), Stream.runCollect);

const subscribeAndDrain = (
  streamId: string,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    subscribe(streamId),
    Effect.flatMap(drainEventStream),
    Effect.provide(ProtocolLive(clientTransport))
  );

const subscribeAndCollect = (
  streamId: string,
  count: number,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    subscribe(streamId),
    Effect.flatMap(collectEventStream(count)),
    Effect.provide(ProtocolLive(clientTransport))
  );

const collectEventsAsArray = (events: ReadonlyDeep<Iterable<Event>>) => Array.from(events);

const runTestWithServerProtocol = <A, E, R>(
  {
    server,
    clientTransport,
  }: {
    readonly server: ReadonlyDeep<InMemoryServer>;
    readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
  },
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  testLogic: (
    clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
  ) => Effect.Effect<A, E, R>
) =>
  pipe(
    createTestServerProtocol(server, commandHandler),
    Effect.flatMap(() => testLogic(clientTransport))
  );

const runTestWithFullServerProtocol = <A, E, R>(
  {
    server,
    clientTransport,
  }: {
    readonly server: ReadonlyDeep<InMemoryServer>;
    readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
  },
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  testLogic: (
    clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
  ) => Effect.Effect<A, E, R>
) =>
  pipe(
    createTestServerProtocol(server, commandHandler, subscriptionHandler),
    Effect.flatMap(() => testLogic(clientTransport))
  );

const createTestEvent = (
  streamId: string,
  eventNumber: number,
  type: string,
  data: unknown,
  timestamp: Date
): Event => ({
  position: { streamId: unsafeCreateStreamId(streamId), eventNumber },
  type,
  data,
  timestamp,
});

const makeEventsByStreamId =
  (eventsByStreamId: Record<string, readonly Event[]>) => (streamId: string) =>
    eventsByStreamId[streamId] ?? [];

const runTest = <A, E, R>(
  testLogic: (env: {
    readonly server: ReadonlyDeep<InMemoryServer>;
    readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
  }) => Effect.Effect<A, E, R>
) => pipe(setupTestEnvironment, Effect.flatMap(testLogic), Effect.scoped);

const runTestWithProtocol = <A, E, R>(
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  testLogic: (
    clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
  ) => Effect.Effect<A, E, R>
) => runTest((env) => runTestWithServerProtocol(env, commandHandler, testLogic));

const runTestWithFullProtocol = <A, E, R>(
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  testLogic: (
    clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
  ) => Effect.Effect<A, E, R>
) =>
  runTest((env) =>
    runTestWithFullServerProtocol(env, commandHandler, subscriptionHandler, testLogic)
  );

const defaultSuccessHandler =
  (streamId: string, eventNumber: number) => (_cmd: ReadonlyDeep<WireCommand>) => ({
    _tag: 'Success' as const,
    position: { streamId: unsafeCreateStreamId(streamId), eventNumber },
  });

const conditionalSuccessHandler =
  (
    predicate: (cmd: ReadonlyDeep<WireCommand>) => boolean,
    streamId: (cmd: ReadonlyDeep<WireCommand>) => string,
    eventNumber: (cmd: ReadonlyDeep<WireCommand>) => number
  ) =>
  (cmd: ReadonlyDeep<WireCommand>) =>
    predicate(cmd)
      ? {
          _tag: 'Success' as const,
          position: {
            streamId: unsafeCreateStreamId(streamId(cmd)),
            eventNumber: eventNumber(cmd),
          },
        }
      : {
          _tag: 'Failure' as const,
          error: {
            _tag: 'UnknownError' as const,
            commandId: cmd.id,
            message: 'WireCommand failed',
          },
        };

const createWireCommand = (target: string, name: string, payload: unknown): WireCommand => ({
  id: crypto.randomUUID(),
  target,
  name,
  payload,
});

const subscribeCollectAndVerify =
  (streamId: string, count: number, verify: (events: readonly Event[]) => Effect.Effect<void>) =>
  (clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
    pipe(
      subscribeAndCollect(streamId, count, clientTransport),
      Effect.map(collectEventsAsArray),
      Effect.tap(verify),
      Effect.asVoid
    );

const waitForConnection = (transport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
  pipe(
    transport.connectionState,
    Stream.filter((state) => state === 'connected'),
    Stream.take(1),
    Stream.runDrain,
    Effect.as(transport)
  );

const sendMalformedMessage = (server: ReadonlyDeep<InMemoryServer>, payload: string) =>
  server.broadcast(makeTransportMessage(crypto.randomUUID(), 'command_result', payload));

const sendAndVerifyCommandAfterNoise = (
  server: ReadonlyDeep<InMemoryServer>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
  noisyEffect: Effect.Effect<void>
) =>
  pipe(
    noisyEffect,
    Effect.flatMap(() => createTestServerProtocol(server, defaultSuccessHandler('user-123', 1))),
    Effect.flatMap(() =>
      pipe(
        sendWireCommand(createWireCommand('user-123', 'TestWireCommand', { data: 'test' })),
        Effect.tap((result) => Effect.sync(() => expect(result._tag).toBe('Success'))),
        Effect.provide(ProtocolLive(clientTransport))
      )
    )
  );

describe('Protocol Behavior Tests', () => {
  describe('WireCommand Sending and Results', () => {
    it.effect('should send command and receive success result', () =>
      runTestWithProtocol(defaultSuccessHandler('user-123', 42), (clientTransport) =>
        sendCommandWithVerification(
          createWireCommand('user-123', 'UpdateProfile', { name: 'John Doe' }),
          clientTransport,
          verifySuccessResult('user-123', 42)
        )
      )
    );

    it.effect('should send command and receive failure result', () =>
      runTestWithProtocol(
        (command) => ({
          _tag: 'Failure',
          error: {
            _tag: 'ValidationError',
            commandId: command.id,
            commandName: command.name,
            validationErrors: ['Name is required'],
          },
        }),
        (clientTransport) =>
          sendCommandWithVerification(
            createWireCommand('user-123', 'UpdateProfile', { name: '' }),
            clientTransport,
            verifyFailureResult('ValidationError', ['Name is required'])
          )
      )
    );

    it.effect('should handle multiple concurrent commands with proper correlation', () =>
      runTestWithProtocol(
        conditionalSuccessHandler(
          (cmd) => cmd.name === 'CreateUser',
          (cmd) => cmd.target,
          () => Math.floor(Math.random() * 100)
        ),
        (clientTransport) =>
          pipe(
            sendMultipleCommands(
              [
                createWireCommand('user-1', 'CreateUser', { name: 'Alice' }),
                createWireCommand('user-2', 'DeleteUser', { id: 'user-2' }),
                createWireCommand('user-3', 'CreateUser', { name: 'Bob' }),
              ],
              clientTransport
            ),
            Effect.tap(verifyMultipleResults(['Success', 'Failure', 'Success']))
          )
      )
    );
  });

  describe('WireCommand Timeout Behavior', () => {
    it.effect('should timeout commands after 10 seconds', () =>
      pipe(
        runTest(({ clientTransport }) => {
          const command = createWireCommand('user-123', 'SlowWireCommand', { data: 'test' });
          return pipe(
            raceCommandWithTimeout(command, clientTransport, 11),
            Effect.tap(verifyTimeoutError(command.id))
          );
        }),
        Effect.provide(TestContext.TestContext)
      )
    );

    it.effect('should not timeout when response arrives before deadline', () =>
      runTestWithProtocol(defaultSuccessHandler('user-123', 1), (clientTransport) =>
        pipe(
          sendWireCommand(createWireCommand('user-123', 'FastWireCommand', { data: 'test' })),
          Effect.tap((result) => Effect.sync(() => expect(result._tag).toBe('Success'))),
          Effect.provide(ProtocolLive(clientTransport))
        )
      )
    );
  });

  describe('Event Subscription', () => {
    it.effect('should successfully create subscriptions without timeout', () =>
      runTestWithProtocol(defaultSuccessHandler('test', 1), (clientTransport) =>
        subscribeAndDrain('user-123', clientTransport)
      )
    );

    it.effect('should receive events for subscribed streams', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        (streamId) => [
          createTestEvent(
            streamId,
            1,
            'UserCreated',
            { id: streamId, name: 'John Doe' },
            new Date('2024-01-01T10:00:00Z')
          ),
          createTestEvent(
            streamId,
            2,
            'UserEmailUpdated',
            { id: streamId, email: 'john@example.com' },
            new Date('2024-01-01T10:01:00Z')
          ),
        ],
        subscribeCollectAndVerify('user-123', 2, (events) =>
          Effect.sync(() => {
            expect(events).toHaveLength(2);
            expect(events[0]!.type).toBe('UserCreated');
            expect(events[0]!.data).toEqual({ id: 'user-123', name: 'John Doe' });
            expect(events[0]!.position.eventNumber).toBe(1);
            expect(events[1]!.type).toBe('UserEmailUpdated');
            expect(events[1]!.data).toEqual({ id: 'user-123', email: 'john@example.com' });
            expect(events[1]!.position.eventNumber).toBe(2);
            expect(events[0]!.timestamp).toEqual(new Date('2024-01-01T10:00:00Z'));
            expect(events[1]!.timestamp).toEqual(new Date('2024-01-01T10:01:00Z'));
          })
        )
      )
    );

    it.effect('should only receive events for the specific subscribed stream (filtering)', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        makeEventsByStreamId({
          'user-123': [
            createTestEvent(
              'user-123',
              1,
              'UserCreated',
              { id: 'user-123', name: 'John Doe' },
              new Date('2024-01-01T10:00:00Z')
            ),
            createTestEvent(
              'user-123',
              2,
              'UserUpdated',
              { id: 'user-123', name: 'John Updated' },
              new Date('2024-01-01T10:01:00Z')
            ),
          ],
          'other-stream': [
            createTestEvent(
              'other-stream',
              1,
              'OtherUserCreated',
              { id: 'other-stream', name: 'Jane Doe' },
              new Date('2024-01-01T10:02:00Z')
            ),
          ],
        }),
        subscribeCollectAndVerify('user-123', 2, (events) =>
          Effect.sync(() => {
            expect(events).toHaveLength(2);
            expect(events[0]!.type).toBe('UserCreated');
            expect(events[0]!.data).toEqual({ id: 'user-123', name: 'John Doe' });
            expect(events[1]!.type).toBe('UserUpdated');
            expect(events[1]!.data).toEqual({ id: 'user-123', name: 'John Updated' });
            expect(events.some((event) => event.type === 'OtherUserCreated')).toBe(false);
          })
        )
      )
    );

    it.effect('should handle basic event publishing and receiving', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        makeEventsByStreamId({
          'test-stream': [
            createTestEvent(
              'test-stream',
              1,
              'TestEvent',
              { test: 'data', value: 42 },
              new Date('2024-01-01T12:00:00Z')
            ),
          ],
        }),
        subscribeCollectAndVerify('test-stream', 1, (events) =>
          Effect.sync(() => {
            expect(events).toHaveLength(1);
            expect(events[0]!.type).toBe('TestEvent');
            expect(events[0]!.data).toEqual({ test: 'data', value: 42 });
            expect(events[0]!.position.streamId).toEqual(unsafeCreateStreamId('test-stream'));
            expect(events[0]!.position.eventNumber).toBe(1);
            expect(events[0]!.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
          })
        )
      )
    );

    it.effect('should handle receiving events while processing commands concurrently', () =>
      runTestWithFullProtocol(
        (command) => ({
          _tag: 'Success',
          position: { streamId: unsafeCreateStreamId(command.target), eventNumber: 1 },
        }),
        (streamId) => [
          createTestEvent(
            streamId,
            1,
            'UserCreated',
            { id: streamId, name: 'Concurrent User' },
            new Date('2024-01-01T10:00:00Z')
          ),
          createTestEvent(
            streamId,
            2,
            'UserUpdated',
            { id: streamId, status: 'active' },
            new Date('2024-01-01T10:01:00Z')
          ),
        ],
        (clientTransport) =>
          pipe(
            Effect.all(
              [
                pipe(subscribe('user-stream'), Effect.flatMap(collectEventStream(2))),
                Effect.all(
                  [
                    sendWireCommand(createWireCommand('user-1', 'CreateUser', { name: 'Alice' })),
                    sendWireCommand(createWireCommand('user-2', 'UpdateUser', { name: 'Bob' })),
                  ],
                  { concurrency: 'unbounded' }
                ),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.tap(([events, commandResults]) =>
              Effect.sync(() => {
                const collectedEvents = Array.from(events);
                expect(collectedEvents).toHaveLength(2);
                expect(collectedEvents[0]!.type).toBe('UserCreated');
                expect(collectedEvents[1]!.type).toBe('UserUpdated');
                expect(commandResults).toHaveLength(2);
                expect(commandResults[0]!._tag).toBe('Success');
                expect(commandResults[1]!._tag).toBe('Success');
              })
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
      )
    );
  });

  describe('Multiple Subscriptions', () => {
    it.effect('should handle multiple clients subscribing to the same stream', () =>
      runTest(({ server, clientTransport: client1Transport }) =>
        pipe(
          server.connector(),
          Effect.flatMap(waitForConnection),
          Effect.flatMap((client2Transport) =>
            pipe(
              createTestServerProtocol(
                server,
                defaultSuccessHandler('test', 1),
                makeEventsByStreamId({
                  'shared-stream': [
                    createTestEvent(
                      'shared-stream',
                      1,
                      'SharedEvent1',
                      { message: 'First shared event', clientId: 'all' },
                      new Date('2024-01-01T10:00:00Z')
                    ),
                    createTestEvent(
                      'shared-stream',
                      2,
                      'SharedEvent2',
                      { message: 'Second shared event', value: 42 },
                      new Date('2024-01-01T10:01:00Z')
                    ),
                    createTestEvent(
                      'shared-stream',
                      3,
                      'SharedEvent3',
                      { message: 'Third shared event', status: 'completed' },
                      new Date('2024-01-01T10:02:00Z')
                    ),
                  ],
                })
              ),
              Effect.flatMap(() =>
                pipe(
                  Effect.all(
                    [
                      pipe(
                        subscribe('shared-stream'),
                        Effect.flatMap(collectEventStream(3)),
                        Effect.map((events) => ({
                          clientId: 'client1',
                          events: Array.from(events),
                        })),
                        Effect.provide(ProtocolLive(client1Transport))
                      ),
                      pipe(
                        subscribe('shared-stream'),
                        Effect.flatMap(collectEventStream(3)),
                        Effect.map((events) => ({
                          clientId: 'client2',
                          events: Array.from(events),
                        })),
                        Effect.provide(ProtocolLive(client2Transport))
                      ),
                    ],
                    { concurrency: 'unbounded' }
                  ),
                  Effect.tap((clientResults) =>
                    Effect.sync(() => {
                      const client1Results = clientResults.find((r) => r.clientId === 'client1')!;
                      const client2Results = clientResults.find((r) => r.clientId === 'client2')!;
                      expect(client1Results.events).toHaveLength(3);
                      expect(client2Results.events).toHaveLength(3);
                      [0, 1, 2].forEach((i) => {
                        expect(client1Results.events[i]!.type).toBe(client2Results.events[i]!.type);
                        expect(client1Results.events[i]!.data).toEqual(
                          client2Results.events[i]!.data
                        );
                        expect(client1Results.events[i]!.position.eventNumber).toBe(
                          client2Results.events[i]!.position.eventNumber
                        );
                        expect(client1Results.events[i]!.timestamp).toEqual(
                          client2Results.events[i]!.timestamp
                        );
                      });
                    })
                  )
                )
              )
            )
          )
        )
      )
    );

    it.effect('should handle single client subscribing to multiple different streams', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        makeEventsByStreamId({
          'user-stream': [
            createTestEvent(
              'user-stream',
              1,
              'UserCreated',
              { id: 'user-1', name: 'Alice' },
              new Date('2024-01-01T10:00:00Z')
            ),
            createTestEvent(
              'user-stream',
              2,
              'UserUpdated',
              { id: 'user-1', status: 'active' },
              new Date('2024-01-01T10:01:00Z')
            ),
          ],
          'order-stream': [
            createTestEvent(
              'order-stream',
              1,
              'OrderCreated',
              { orderId: 'order-1', amount: 100 },
              new Date('2024-01-01T11:00:00Z')
            ),
          ],
          'product-stream': [
            createTestEvent(
              'product-stream',
              1,
              'ProductAdded',
              { productId: 'prod-1', name: 'Widget' },
              new Date('2024-01-01T12:00:00Z')
            ),
            createTestEvent(
              'product-stream',
              2,
              'ProductPriced',
              { productId: 'prod-1', price: 25.99 },
              new Date('2024-01-01T12:01:00Z')
            ),
            createTestEvent(
              'product-stream',
              3,
              'ProductPublished',
              { productId: 'prod-1', published: true },
              new Date('2024-01-01T12:02:00Z')
            ),
          ],
        }),
        (clientTransport) =>
          pipe(
            Effect.all(
              [
                pipe(
                  subscribe('user-stream'),
                  Effect.flatMap(collectEventStream(2)),
                  Effect.map((events) => ({ streamType: 'user', events: Array.from(events) }))
                ),
                pipe(
                  subscribe('order-stream'),
                  Effect.flatMap(collectEventStream(1)),
                  Effect.map((events) => ({ streamType: 'order', events: Array.from(events) }))
                ),
                pipe(
                  subscribe('product-stream'),
                  Effect.flatMap(collectEventStream(3)),
                  Effect.map((events) => ({ streamType: 'product', events: Array.from(events) }))
                ),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.tap((streamResults) =>
              Effect.sync(() => {
                const userResults = streamResults.find((r) => r.streamType === 'user')!;
                const orderResults = streamResults.find((r) => r.streamType === 'order')!;
                const productResults = streamResults.find((r) => r.streamType === 'product')!;
                expect(userResults.events).toHaveLength(2);
                expect(userResults.events[0]!.type).toBe('UserCreated');
                expect(orderResults.events).toHaveLength(1);
                expect(orderResults.events[0]!.type).toBe('OrderCreated');
                expect(productResults.events).toHaveLength(3);
                expect(productResults.events[0]!.type).toBe('ProductAdded');
                expect(userResults.events.some((e) => e.type.startsWith('Order'))).toBe(false);
                expect(userResults.events.some((e) => e.type.startsWith('Product'))).toBe(false);
              })
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
      )
    );

    it.effect('should continue receiving events after re-subscribing to a stream', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        makeEventsByStreamId({
          'persistent-stream': [
            createTestEvent(
              'persistent-stream',
              1,
              'EventBeforeResubscribe1',
              { message: 'First event before resubscribe', value: 1 },
              new Date('2024-01-01T10:00:00Z')
            ),
            createTestEvent(
              'persistent-stream',
              2,
              'EventBeforeResubscribe2',
              { message: 'Second event before resubscribe', value: 2 },
              new Date('2024-01-01T10:01:00Z')
            ),
            createTestEvent(
              'persistent-stream',
              3,
              'EventAfterResubscribe1',
              { message: 'First event after resubscribe', value: 3 },
              new Date('2024-01-01T10:02:00Z')
            ),
            createTestEvent(
              'persistent-stream',
              4,
              'EventAfterResubscribe2',
              { message: 'Second event after resubscribe', value: 4 },
              new Date('2024-01-01T10:03:00Z')
            ),
          ],
        }),
        (clientTransport) =>
          pipe(
            Effect.scoped(
              pipe(
                subscribe('persistent-stream'),
                Effect.flatMap(collectEventStream(2)),
                Effect.map(collectEventsAsArray)
              )
            ),
            Effect.flatMap((firstBatch) =>
              pipe(
                Effect.sync(() => {
                  expect(firstBatch).toHaveLength(2);
                  expect(firstBatch[0]!.type).toBe('EventBeforeResubscribe1');
                  expect(firstBatch[1]!.type).toBe('EventBeforeResubscribe2');
                }),
                Effect.flatMap(() =>
                  pipe(
                    subscribe('persistent-stream'),
                    Effect.flatMap(collectEventStream(4)),
                    Effect.map((events) => ({ firstBatch, resubscribeBatch: Array.from(events) }))
                  )
                )
              )
            ),
            Effect.tap(({ resubscribeBatch }) =>
              Effect.sync(() => {
                expect(resubscribeBatch).toHaveLength(4);
                expect(resubscribeBatch[0]!.type).toBe('EventBeforeResubscribe1');
                expect(resubscribeBatch[2]!.type).toBe('EventAfterResubscribe1');
                expect(resubscribeBatch[0]!.position.eventNumber).toBe(1);
                expect(resubscribeBatch[3]!.position.eventNumber).toBe(4);
              })
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
      )
    );
  });

  describe('Error Handling', () => {
    it.effect('should handle malformed JSON messages gracefully', () =>
      runTest(({ server, clientTransport }) =>
        sendAndVerifyCommandAfterNoise(
          server,
          clientTransport,
          sendMalformedMessage(server, 'invalid json {')
        )
      )
    );

    it.effect('should handle responses for unknown command IDs gracefully', () =>
      runTest(({ server, clientTransport }) =>
        sendAndVerifyCommandAfterNoise(
          server,
          clientTransport,
          sendMalformedMessage(
            server,
            JSON.stringify({
              type: 'command_result',
              commandId: 'non-existent-command-id',
              success: true,
              position: { streamId: unsafeCreateStreamId('user-123'), eventNumber: 1 },
            })
          )
        )
      )
    );

    it.effect('should handle malformed command result - success without position', () =>
      pipe(
        runTest(({ server, clientTransport }) => {
          const command = createWireCommand('user-123', 'TestWireCommand', { data: 'test' });
          return pipe(
            Effect.all(
              [
                sendCommandAsEither(command, clientTransport),
                pipe(
                  Effect.sleep(Duration.millis(50)),
                  Effect.flatMap(() =>
                    sendMalformedMessage(
                      server,
                      JSON.stringify({
                        type: 'command_result',
                        commandId: command.id,
                        success: true,
                      })
                    )
                  )
                ),
                TestClock.adjust(Duration.seconds(11)),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.map(([result, _, __]) => result),
            Effect.tap(verifyTimeoutError(command.id))
          );
        }),
        Effect.provide(TestContext.TestContext)
      )
    );

    it.effect('should handle malformed command result - failure without error message', () =>
      pipe(
        runTest(({ server, clientTransport }) => {
          const command = createWireCommand('user-123', 'TestWireCommand', { data: 'test' });
          return pipe(
            Effect.all(
              [
                sendCommandAsEither(command, clientTransport),
                pipe(
                  Effect.sleep(Duration.millis(50)),
                  Effect.flatMap(() =>
                    sendMalformedMessage(
                      server,
                      JSON.stringify({
                        type: 'command_result',
                        commandId: command.id,
                        success: false,
                      })
                    )
                  )
                ),
                TestClock.adjust(Duration.seconds(11)),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.map(([result, _, __]) => result),
            Effect.tap(verifyTimeoutError(command.id))
          );
        }),
        Effect.provide(TestContext.TestContext)
      )
    );
  });

  describe('Transport Failure & Recovery', () => {
    it.effect('should clean up pending commands when transport disconnects', () =>
      pipe(
        runTest(({ clientTransport }) =>
          pipe(
            Effect.all(
              [
                sendCommandAsEither(
                  createWireCommand('user-123', 'SlowWireCommand', { data: 'test' }),
                  clientTransport
                ),
                TestClock.adjust(Duration.seconds(11)),
              ],
              { concurrency: 'unbounded' }
            ),
            Effect.map(([result, _]) => result),
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(Either.isLeft(result)).toBe(true);
                if (Either.isLeft(result)) {
                  expect(result.left).toBeInstanceOf(WireCommandTimeoutError);
                }
              })
            )
          )
        ),
        Effect.provide(TestContext.TestContext)
      )
    );

    it.effect('should clean up subscriptions when transport fails', () =>
      runTestWithFullProtocol(
        defaultSuccessHandler('test', 1),
        (streamId) => [
          createTestEvent(
            streamId,
            1,
            'TestEvent',
            { message: 'before disconnect' },
            new Date('2024-01-01T10:00:00Z')
          ),
        ],
        (clientTransport) =>
          pipe(
            Effect.scoped(
              pipe(
                subscribe('test-stream'),
                Effect.flatMap(collectEventStream(1)),
                Effect.tap((events) =>
                  Effect.sync(() => {
                    const eventArray = Array.from(events);
                    expect(eventArray).toHaveLength(1);
                    expect(eventArray[0]!.type).toBe('TestEvent');
                    expect(eventArray[0]!.data).toEqual({ message: 'before disconnect' });
                  })
                )
              )
            ),
            Effect.flatMap(() =>
              pipe(
                subscribe('test-stream'),
                Effect.flatMap(collectEventStream(1)),
                Effect.tap((events) =>
                  Effect.sync(() => {
                    const eventArray = Array.from(events);
                    expect(eventArray).toHaveLength(1);
                    expect(eventArray[0]!.type).toBe('TestEvent');
                  })
                )
              )
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
      )
    );

    it.effect('should handle transport reconnection gracefully', () =>
      runTest(({ server, clientTransport: firstTransport }) =>
        pipe(
          createTestServerProtocol(server, (cmd) => ({
            _tag: 'Success',
            position: { streamId: unsafeCreateStreamId(cmd.target), eventNumber: 1 },
          })),
          Effect.flatMap(() =>
            pipe(
              sendWireCommand(
                createWireCommand('first-connection', 'TestWireCommand', { data: 'first' })
              ),
              Effect.tap((result) => Effect.sync(() => expect(result._tag).toBe('Success'))),
              Effect.provide(ProtocolLive(firstTransport))
            )
          ),
          Effect.flatMap(() =>
            pipe(
              server.connector(),
              Effect.flatMap(waitForConnection),
              Effect.tap((newTransport) =>
                Effect.sync(() => {
                  expect(newTransport).toBeDefined();
                  expect(typeof newTransport.publish).toBe('function');
                  expect(typeof newTransport.subscribe).toBe('function');
                })
              )
            )
          )
        )
      )
    );
  });

  describe('Server Protocol Integration', () => {
    it.effect('should emit commands through server protocol onWireCommand stream', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            ServerProtocol,
            Effect.flatMap((serverProtocol) => {
              const command: WireCommand = {
                id: crypto.randomUUID(),
                target: 'user-123',
                name: 'CreateUser',
                payload: { name: 'Alice', email: 'alice@example.com' },
              };

              return pipe(
                Effect.all(
                  [
                    // Listen for commands on the server protocol's onWireCommand stream
                    pipe(
                      serverProtocol.onWireCommand,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.map((commands) => Array.from(commands))
                    ),
                    // Send a command from the client after a small delay
                    pipe(
                      Effect.sleep(Duration.millis(50)),
                      Effect.flatMap(() =>
                        pipe(
                          sendWireCommand(command),
                          Effect.provide(ProtocolLive(clientTransport)),
                          Effect.either
                        )
                      )
                    ),
                    // Advance the test clock to trigger command timeout
                    TestClock.adjust(Duration.seconds(11)),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([receivedWireCommands, commandResult, _]) =>
                  Effect.sync(() => {
                    // Verify the command was received by the server protocol
                    expect(receivedWireCommands).toHaveLength(1);

                    const receivedWireCommand = receivedWireCommands[0]!;
                    expect(receivedWireCommand.id).toBe(command.id);
                    expect(receivedWireCommand.target).toBe(command.target);
                    expect(receivedWireCommand.name).toBe(command.name);
                    expect(receivedWireCommand.payload).toEqual(command.payload);

                    // The command should timeout on the client side since we're not responding
                    expect(Either.isLeft(commandResult)).toBe(true);
                    if (Either.isLeft(commandResult)) {
                      expect(commandResult.left).toBeInstanceOf(WireCommandTimeoutError);
                    }
                  })
                )
              );
            }),
            Effect.provide(ServerProtocolLive(server))
          )
        ),
        Effect.scoped,
        Effect.provide(TestContext.TestContext)
      )
    );

    it.effect('should deliver command results via server protocol sendResult', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            ServerProtocol,
            Effect.flatMap((serverProtocol) => {
              const command: WireCommand = {
                id: crypto.randomUUID(),
                target: 'user-456',
                name: 'UpdateProfile',
                payload: { name: 'Bob', email: 'bob@example.com' },
              };

              const successResult: CommandResult = {
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId('user-456'),
                  eventNumber: 99,
                },
              };

              return pipe(
                Effect.all(
                  [
                    // Send command from client
                    pipe(sendWireCommand(command), Effect.provide(ProtocolLive(clientTransport))),
                    // Server processes the command and sends result
                    pipe(
                      serverProtocol.onWireCommand,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.flatMap((commands) => {
                        const receivedWireCommand = Array.from(commands)[0]!;
                        // Verify we got the command, then send a result
                        return pipe(
                          Effect.sync(() => {
                            expect(receivedWireCommand.id).toBe(command.id);
                            expect(receivedWireCommand.target).toBe(command.target);
                            expect(receivedWireCommand.name).toBe(command.name);
                          }),
                          Effect.flatMap(() =>
                            serverProtocol.sendResult(receivedWireCommand.id, successResult)
                          )
                        );
                      })
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.tap(([clientResult, _]) =>
                  Effect.sync(() => {
                    // Verify the client received the correct result
                    expect(clientResult._tag).toBe('Success');
                    if (clientResult._tag === 'Success') {
                      expect(clientResult.position.streamId).toEqual(
                        unsafeCreateStreamId('user-456')
                      );
                      expect(clientResult.position.eventNumber).toBe(99);
                    }
                  })
                )
              );
            }),
            Effect.provide(ServerProtocolLive(server))
          )
        ),
        Effect.scoped
      )
    );

    it.effect('should publish events via server protocol publishEvent', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, undefined, (streamId) => {
              // Return event when client subscribes to 'product-789'
              if (streamId === 'product-789') {
                return [
                  {
                    position: {
                      streamId: unsafeCreateStreamId('product-789'),
                      eventNumber: 42,
                    },
                    type: 'ProductCreated',
                    data: {
                      id: 'product-789',
                      name: 'Super Widget',
                      price: 99.99,
                      category: 'electronics',
                    },
                    timestamp: new Date('2024-01-15T14:30:00Z'),
                  },
                ];
              }
              return [];
            }),
            Effect.flatMap(() =>
              pipe(
                // Client subscribes to the stream and waits for events
                subscribe('product-789'),
                Effect.flatMap((eventStream) =>
                  pipe(
                    eventStream,
                    Stream.take(1),
                    Stream.runCollect,
                    Effect.map((events) => Array.from(events))
                  )
                ),
                Effect.tap((receivedEvents) =>
                  Effect.sync(() => {
                    // Verify the client received the published event
                    expect(receivedEvents).toHaveLength(1);

                    const receivedEvent = receivedEvents[0]!;
                    expect(receivedEvent.type).toBe('ProductCreated');
                    expect(receivedEvent.position.streamId).toEqual(
                      unsafeCreateStreamId('product-789')
                    );
                    expect(receivedEvent.position.eventNumber).toBe(42);
                    expect(receivedEvent.data).toEqual({
                      id: 'product-789',
                      name: 'Super Widget',
                      price: 99.99,
                      category: 'electronics',
                    });
                    expect(receivedEvent.timestamp).toEqual(new Date('2024-01-15T14:30:00Z'));
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              )
            )
          )
        ),
        Effect.scoped
      )
    );
  });

  describe('Edge Cases', () => {
    it.effect('should handle duplicate command IDs appropriately', () =>
      pipe(
        runTestWithProtocol(
          (command) => ({
            _tag: 'Success',
            position: { streamId: unsafeCreateStreamId(command.target), eventNumber: 42 },
          }),
          (clientTransport) => {
            const duplicateId = crypto.randomUUID();
            const command1 = {
              ...createWireCommand('user-123', 'CreateUser', { name: 'Alice' }),
              id: duplicateId,
            };
            const command2 = {
              ...createWireCommand('user-456', 'CreateUser', { name: 'Bob' }),
              id: duplicateId,
            };
            return pipe(
              Effect.all(
                [
                  sendCommandAsEither(command1, clientTransport),
                  sendCommandAsEither(command2, clientTransport),
                  TestClock.adjust(Duration.millis(100)),
                ],
                { concurrency: 'unbounded' }
              ),
              Effect.map(([result1, result2, _]) => [result1, result2]),
              Effect.tap(([result1, result2]) =>
                Effect.sync(() => {
                  expect(Either.isRight(result1!)).toBe(true);
                  expect(Either.isRight(result2!)).toBe(true);
                  if (Either.isRight(result1!) && Either.isRight(result2!)) {
                    expect(result1!.right._tag).toBe('Success');
                    expect(result2!.right._tag).toBe('Success');
                    if (result1!.right._tag === 'Success' && result2!.right._tag === 'Success') {
                      expect(result1!.right.position.eventNumber).toBe(42);
                      expect(result2!.right.position.eventNumber).toBe(42);
                      expect(result1!.right.position.streamId).toEqual(
                        result2!.right.position.streamId
                      );
                    }
                  }
                })
              )
            );
          }
        ),
        Effect.provide(TestContext.TestContext)
      )
    );

    it.effect('should handle very large payloads in commands and events', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              (command) => ({
                _tag: 'Success',
                position: {
                  streamId: unsafeCreateStreamId(command.target),
                  eventNumber: 1,
                },
              }),
              (streamId) => {
                // Create a large event payload
                const largeData = {
                  description: 'A'.repeat(10000), // 10KB string
                  metadata: {
                    tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
                    attributes: Object.fromEntries(
                      Array.from({ length: 50 }, (_, i) => [`attr-${i}`, `value-${i}`.repeat(20)])
                    ),
                  },
                  content: Array.from({ length: 1000 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`,
                    data: `${'x'.repeat(50)}-${i}`,
                  })),
                };

                return [
                  {
                    position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                    type: 'LargeDataEvent',
                    data: largeData,
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                  },
                ];
              }
            ),
            Effect.flatMap(() => {
              // Create a large command payload
              const largePayload = {
                bulkData: Array.from({ length: 500 }, (_, i) => ({
                  id: `bulk-item-${i}`,
                  name: `Bulk Item ${i}`,
                  description: `This is a description for bulk item ${i}. `.repeat(20),
                  properties: Object.fromEntries(
                    Array.from({ length: 10 }, (_, j) => [`prop-${j}`, `value-${j}-for-item-${i}`])
                  ),
                })),
                metadata: {
                  timestamp: new Date().toISOString(),
                  version: '1.0.0',
                  source: 'bulk-import-system',
                  correlationId: crypto.randomUUID(),
                },
              };

              const command: WireCommand = {
                id: crypto.randomUUID(),
                target: 'bulk-stream',
                name: 'BulkImportWireCommand',
                payload: largePayload,
              };

              return pipe(
                Effect.all(
                  [
                    // Send the large command and verify it succeeds
                    pipe(
                      sendWireCommand(command),
                      Effect.tap((result) =>
                        Effect.sync(() => {
                          expect(result._tag).toBe('Success');
                          if (result._tag === 'Success') {
                            expect(result.position.streamId).toEqual(
                              unsafeCreateStreamId('bulk-stream')
                            );
                            expect(result.position.eventNumber).toBe(1);
                          }
                        })
                      )
                    ),
                    // Subscribe to the stream and verify we receive the large event
                    pipe(
                      subscribe('bulk-stream'),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.tap((collectedEvents) =>
                            Effect.sync(() => {
                              const events = Array.from(collectedEvents);
                              expect(events).toHaveLength(1);

                              const event = events[0]!;
                              expect(event.type).toBe('LargeDataEvent');
                              expect(event.position.eventNumber).toBe(1);

                              // Verify the large data structure is preserved
                              const data = event.data as {
                                readonly description: string;
                                readonly metadata: {
                                  readonly tags: readonly string[];
                                  readonly attributes: Readonly<Record<string, string>>;
                                };
                                readonly content: ReadonlyArray<{
                                  readonly id: number;
                                  readonly name: string;
                                  readonly data: string;
                                }>;
                              };
                              expect(data.description).toHaveLength(10000);
                              expect(data.description).toBe('A'.repeat(10000));
                              expect(data.metadata.tags).toHaveLength(100);
                              expect(data.metadata.tags[0]).toBe('tag-0');
                              expect(data.metadata.tags[99]).toBe('tag-99');
                              expect(data.content).toHaveLength(1000);
                              expect(data.content[0]).toEqual({
                                id: 0,
                                name: 'Item 0',
                                data: `${'x'.repeat(50)}-0`,
                              });
                              expect(data.content[999]).toEqual({
                                id: 999,
                                name: 'Item 999',
                                data: `${'x'.repeat(50)}-999`,
                              });

                              // Verify nested object structure
                              expect(Object.keys(data.metadata.attributes)).toHaveLength(50);
                              expect(data.metadata.attributes['attr-0']).toBe('value-0'.repeat(20));
                            })
                          )
                        )
                      )
                    ),
                  ],
                  { concurrency: 'unbounded' }
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        ),
        Effect.scoped
      )
    );

    it.effect('should handle rapid subscription/unsubscription cycles', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(
              server,
              () => ({
                _tag: 'Success',
                position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
              }),
              (streamId) => {
                // Return a simple event for any subscription
                return [
                  {
                    position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
                    type: 'CycleTestEvent',
                    data: { streamId, cycle: true },
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                  },
                ];
              }
            ),
            Effect.flatMap(() => {
              // Perform rapid subscription/unsubscription cycles
              const performCycle = (cycleNumber: number) =>
                pipe(
                  Effect.scoped(
                    pipe(
                      subscribe(`cycle-stream-${cycleNumber}`),
                      Effect.flatMap((eventStream) =>
                        pipe(
                          // Take just 1 event then let scope end (unsubscribe)
                          eventStream,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.map((events) => ({
                            cycleNumber,
                            eventCount: Array.from(events).length,
                            firstEvent: Array.from(events)[0],
                          }))
                        )
                      )
                    )
                  )
                );

              // Perform 10 rapid cycles
              const cycles = Array.from({ length: 10 }, (_, i) => performCycle(i));

              return pipe(
                Effect.all(cycles, { concurrency: 'unbounded' }),
                Effect.tap((results) =>
                  Effect.sync(() => {
                    // Verify all cycles completed successfully
                    expect(results).toHaveLength(10);

                    // Each cycle should have received exactly 1 event
                    results.forEach((result, index) => {
                      expect(result.cycleNumber).toBe(index);
                      expect(result.eventCount).toBe(1);
                      expect(result.firstEvent?.type).toBe('CycleTestEvent');
                      expect(result.firstEvent?.data).toEqual({
                        streamId: `cycle-stream-${index}`,
                        cycle: true,
                      });
                      expect(result.firstEvent?.position.eventNumber).toBe(1);
                    });

                    // Verify we got events for all the different streams
                    const uniqueStreamIds = new Set(
                      results.map(
                        (r) => (r.firstEvent?.data as { readonly streamId?: string })?.streamId
                      )
                    );
                    expect(uniqueStreamIds.size).toBe(10);

                    // Verify stream names are correct
                    Array.from({ length: 10 }, (_, i) => i).forEach((i) => {
                      expect(uniqueStreamIds.has(`cycle-stream-${i}`)).toBe(true);
                    });
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        ),
        Effect.scoped
      )
    );
  });

  describe('Basic Cleanup', () => {
    it.effect('should clean up subscriptions when stream scope ends', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ clientTransport }) =>
          pipe(
            Effect.scoped(
              pipe(
                subscribe('user-123'),
                Effect.flatMap((eventStream) => pipe(eventStream, Stream.take(0), Stream.runDrain))
              )
            ),
            Effect.flatMap(() =>
              pipe(
                subscribe('user-456'),
                Effect.flatMap((newEventStream) =>
                  pipe(newEventStream, Stream.take(0), Stream.runDrain)
                )
              )
            ),
            Effect.provide(ProtocolLive(clientTransport))
          )
        ),
        Effect.scoped
      )
    );

    it.effect('should handle multiple sequential commands after cleanup', () =>
      pipe(
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          pipe(
            createTestServerProtocol(server, (command) => ({
              _tag: 'Success',
              position: {
                streamId: unsafeCreateStreamId(command.target),
                eventNumber: Math.floor(Math.random() * 100) + 1,
              },
            })),
            Effect.flatMap(() => {
              // Create multiple commands to send sequentially
              const commands: readonly WireCommand[] = Array.from({ length: 5 }, (_, i) => ({
                id: crypto.randomUUID(),
                target: `user-${i + 1}`,
                name: 'SequentialWireCommand',
                payload: { sequence: i + 1, data: `test-data-${i + 1}` },
              }));

              // Send commands sequentially (not concurrently) to test cleanup between commands
              const sendSequentially = (cmds: ReadonlyDeep<readonly WireCommand[]>) =>
                Effect.forEach(cmds, sendWireCommand, {
                  concurrency: 1,
                });

              return pipe(
                sendSequentially(commands),
                Effect.tap((results) =>
                  Effect.sync(() => {
                    // All commands should have succeeded
                    const resultsArray = Array.from(results);
                    expect(resultsArray).toHaveLength(5);
                    resultsArray.forEach((result, index) => {
                      expect(result._tag).toBe('Success');
                      if (result._tag === 'Success') {
                        expect(result.position.streamId).toEqual(
                          unsafeCreateStreamId(`user-${index + 1}`)
                        );
                        expect(result.position.eventNumber).toBeGreaterThan(0);
                        expect(result.position.eventNumber).toBeLessThanOrEqual(100);
                      }
                    });
                  })
                ),
                Effect.provide(ProtocolLive(clientTransport))
              );
            })
          )
        ),
        Effect.scoped
      )
    );
  });
});
