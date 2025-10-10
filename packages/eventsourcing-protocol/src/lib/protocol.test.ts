import { describe, expect, it } from '@codeforbreakfast/buntest';
import {
  Effect,
  Stream,
  Duration,
  pipe,
  TestClock,
  TestContext,
  Either,
  Schema,
  Context,
  Match,
  Tracer,
  Console,
} from 'effect';
import {
  ProtocolLive,
  sendWireCommand,
  subscribe,
  ProtocolCommandTimeoutError,
  Event,
} from './protocol';
import {
  WireCommand,
  CommandResult,
  isCommandSuccess,
  isCommandFailure,
} from '@codeforbreakfast/eventsourcing-commands';
import { ServerProtocolLive, ServerProtocol } from './server-protocol';
import {
  InMemoryAcceptor,
  type InMemoryServer,
} from '@codeforbreakfast/eventsourcing-transport-inmemory';
import {
  makeTransportMessage,
  type TransportMessage,
  Server,
  Client,
} from '@codeforbreakfast/eventsourcing-transport';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { type ReadonlyDeep } from 'type-fest';

// ============================================================================
// Test Helpers
// ============================================================================

const unsafeCreateStreamId = Schema.decodeUnknownSync(EventStreamId);

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
    pipe(clientTransport, waitForConnectedState, Effect.as({ server, clientTransport }));

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
        success: isCommandSuccess(result),
        ...(isCommandSuccess(result)
          ? { position: result.position }
          : { error: JSON.stringify(result.error) }),
        context: {
          traceId: '00000000000000000000000000000000',
          parentId: '0000000000000000',
        },
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
              context: {
                traceId: '00000000000000000000000000000000',
                parentId: '0000000000000000',
              },
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

const logParseError = (error: unknown, payload: unknown) =>
  pipe(
    Console.error('Test server failed to handle message:', error),
    Effect.andThen(Console.error('Message payload:', payload))
  );

const parseAndHandleMessage = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  message: ReadonlyDeep<TransportMessage>
) =>
  pipe(
    message.payload as string,
    (payload) => Effect.try(() => JSON.parse(payload)),
    Effect.flatMap((parsedMessage: ParsedMessage) =>
      handleParsedMessage(server, commandHandler, subscriptionHandler, parsedMessage)
    ),
    Effect.tapError((error) => logParseError(error, message.payload)),
    Effect.orDie
  );

const logHandlerError = (error: unknown, message: ReadonlyDeep<TransportMessage>) =>
  pipe(
    Console.error('❌ Test server message handler failed:', error),
    Effect.andThen(Console.error('Message:', message))
  );

const handleMessageWithErrorLogging = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  message: ReadonlyDeep<TransportMessage>
) =>
  pipe(
    parseAndHandleMessage(server, commandHandler, subscriptionHandler, message),
    Effect.tapError((error) => logHandlerError(error, message))
  );

const processMessageStream = (
  server: ReadonlyDeep<InMemoryServer>,
  commandHandler: (cmd: ReadonlyDeep<WireCommand>) => CommandResult,
  subscriptionHandler: (streamId: string) => readonly Event[],
  messageStream: ReadonlyDeep<Stream.Stream<TransportMessage>>
) =>
  pipe(
    messageStream,
    Stream.runForEach((message: ReadonlyDeep<TransportMessage>) =>
      handleMessageWithErrorLogging(server, commandHandler, subscriptionHandler, message)
    ),
    Effect.forkScoped
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
    Effect.map(
      (connections: ReadonlyDeep<Iterable<Server.ClientConnection>>) => Array.from(connections)[0]!
    ),
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
    expect(isCommandSuccess(result)).toBe(true);
    if (isCommandSuccess(result)) {
      expect(result.position.streamId).toEqual(unsafeCreateStreamId(streamId));
      expect(result.position.eventNumber).toBe(eventNumber);
    }
  });

const verifyFailureResult =
  (expectedErrorTag: string, expectedErrors?: readonly string[]) => (result: CommandResult) =>
    Effect.sync(() => {
      expect(isCommandFailure(result)).toBe(true);
      if (isCommandFailure(result)) {
        pipe(
          result.error,
          Match.value,
          Match.tag('UnknownError', (error) => {
            const parsedError = JSON.parse(error.message) as {
              readonly _tag: string;
              readonly validationErrors?: readonly string[];
            };
            // eslint-disable-next-line effect/no-direct-tag-access -- Validating serialized error JSON structure
            expect(parsedError._tag).toBe(expectedErrorTag);
            if (expectedErrors) {
              expect(parsedError.validationErrors).toEqual(expectedErrors);
            }
          }),
          Match.orElse(() => {
            throw new Error('Expected UnknownError');
          })
        );
      }
    });

const sendCommandWithVerification = (
  command: ReadonlyDeep<WireCommand>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
  verify: (result: CommandResult) => Effect.Effect<void>
) =>
  pipe(
    command,
    sendWireCommand,
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
        const checkFn = expectedTag === 'Success' ? isCommandSuccess : isCommandFailure;
        expect(checkFn(results[index]!)).toBe(true);
      });
    });

const sendCommandAsEither = (
  command: ReadonlyDeep<WireCommand>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) => pipe(command, sendWireCommand, Effect.either, Effect.provide(ProtocolLive(clientTransport)));

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
        expect(result.left).toBeInstanceOf(ProtocolCommandTimeoutError);
        if (result.left instanceof ProtocolCommandTimeoutError) {
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

const subscribeAndDrain =
  (streamId: string) => (clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
    pipe(
      streamId,
      subscribe,
      Effect.flatMap(drainEventStream),
      Effect.provide(ProtocolLive(clientTransport))
    );

const subscribeAndCollect = (
  streamId: string,
  count: number,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    streamId,
    subscribe,
    Effect.flatMap(collectEventStream(count)),
    Effect.provide(ProtocolLive(clientTransport))
  );

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
    Effect.andThen(testLogic(clientTransport))
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
    Effect.andThen(testLogic(clientTransport))
  );

const createTestEvent = (
  streamId: string,
  eventNumber: number,
  type: string,
  data: unknown,
  timestamp: ReadonlyDeep<Date>
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
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
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
      Effect.map(Array.from<Event>),
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

const sendTestCommandWithProtocol = (
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
) =>
  pipe(
    createWireCommand('user-123', 'TestWireCommand', { data: 'test' }),
    sendWireCommand,
    Effect.tap((result) => Effect.sync(() => expect(isCommandSuccess(result)).toBe(true))),
    Effect.provide(ProtocolLive(clientTransport))
  );

const sendAndVerifyCommandAfterNoise = (
  server: ReadonlyDeep<InMemoryServer>,
  clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
  noisyEffect: Effect.Effect<void>
) =>
  pipe(
    noisyEffect,
    Effect.andThen(createTestServerProtocol(server, defaultSuccessHandler('user-123', 1))),
    Effect.andThen(sendTestCommandWithProtocol(clientTransport))
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
    const runSlowCommandTimeoutTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const command = createWireCommand('user-123', 'SlowWireCommand', { data: 'test' });
      return pipe(
        raceCommandWithTimeout(command, clientTransport, 11),
        Effect.tap(verifyTimeoutError(command.id))
      );
    };

    it.effect('should timeout commands after 10 seconds', () =>
      pipe(
        ({
          clientTransport,
        }: {
          readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
        }) => runSlowCommandTimeoutTest(clientTransport),
        runTest,
        Effect.provide(TestContext.TestContext)
      )
    );

    const sendFastCommandAndVerify = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        createWireCommand('user-123', 'FastWireCommand', { data: 'test' }),
        sendWireCommand,
        Effect.tap((result) => Effect.sync(() => expect(isCommandSuccess(result)).toBe(true))),
        Effect.provide(ProtocolLive(clientTransport))
      );

    it.effect('should not timeout when response arrives before deadline', () =>
      runTestWithProtocol(defaultSuccessHandler('user-123', 1), sendFastCommandAndVerify)
    );
  });

  describe('Event Subscription', () => {
    it.effect('should successfully create subscriptions without timeout', () =>
      runTestWithProtocol(defaultSuccessHandler('test', 1), subscribeAndDrain('user-123'))
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

    const subscribeToUserStream = pipe(
      'user-stream',
      subscribe,
      Effect.flatMap(collectEventStream(2))
    );

    const createUserAliceCommand = createWireCommand('user-1', 'CreateUser', { name: 'Alice' });
    const updateUserBobCommand = createWireCommand('user-2', 'UpdateUser', { name: 'Bob' });
    const sendUserAliceCommand = pipe(createUserAliceCommand, sendWireCommand);
    const sendUpdateUserBobCommand = pipe(updateUserBobCommand, sendWireCommand);

    const sendConcurrentUserCommands = Effect.all(
      [sendUserAliceCommand, sendUpdateUserBobCommand],
      {
        concurrency: 'unbounded',
      }
    );

    const verifyConcurrentEventsAndCommands = (
      results: readonly [ReadonlyDeep<Iterable<Event>>, readonly CommandResult[]]
    ) =>
      Effect.sync(() => {
        const [events, commandResults] = results;
        const collectedEvents = Array.from(events);
        expect(collectedEvents).toHaveLength(2);
        expect(collectedEvents[0]!.type).toBe('UserCreated');
        expect(collectedEvents[1]!.type).toBe('UserUpdated');
        expect(commandResults).toHaveLength(2);
        expect(isCommandSuccess(commandResults[0]!)).toBe(true);
        expect(isCommandSuccess(commandResults[1]!)).toBe(true);
      });

    const runConcurrentEventsAndCommands = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        Effect.all([subscribeToUserStream, sendConcurrentUserCommands], {
          concurrency: 'unbounded',
        }),
        Effect.tap(verifyConcurrentEventsAndCommands),
        Effect.provide(ProtocolLive(clientTransport))
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
        runConcurrentEventsAndCommands
      )
    );
  });

  describe('Multiple Subscriptions', () => {
    const sharedStreamEvents = [
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
    ];

    const subscribeClient1ToSharedStream = (
      client1Transport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        'shared-stream',
        subscribe,
        Effect.flatMap(collectEventStream(3)),
        Effect.map((events) => ({
          clientId: 'client1',
          events: Array.from(events),
        })),
        Effect.provide(ProtocolLive(client1Transport))
      );

    const subscribeClient2ToSharedStream = (
      client2Transport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        'shared-stream',
        subscribe,
        Effect.flatMap(collectEventStream(3)),
        Effect.map((events) => ({
          clientId: 'client2',
          events: Array.from(events),
        })),
        Effect.provide(ProtocolLive(client2Transport))
      );

    const verifySharedStreamResults = (
      clientResults: readonly {
        readonly clientId: string;
        readonly events: readonly Event[];
      }[]
    ) =>
      Effect.sync(() => {
        const client1Results = clientResults.find((r) => r.clientId === 'client1')!;
        const client2Results = clientResults.find((r) => r.clientId === 'client2')!;
        expect(client1Results.events).toHaveLength(3);
        expect(client2Results.events).toHaveLength(3);
        [0, 1, 2].forEach((i) => {
          expect(client1Results.events[i]!.type).toBe(client2Results.events[i]!.type);
          expect(client1Results.events[i]!.data).toEqual(client2Results.events[i]!.data);
          expect(client1Results.events[i]!.position.eventNumber).toBe(
            client2Results.events[i]!.position.eventNumber
          );
          expect(client1Results.events[i]!.timestamp).toEqual(client2Results.events[i]!.timestamp);
        });
      });

    const runBothClientsSubscription = (
      client1Transport: ReadonlyDeep<Server.ClientConnection['transport']>,
      client2Transport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        Effect.all(
          [
            subscribeClient1ToSharedStream(client1Transport),
            subscribeClient2ToSharedStream(client2Transport),
          ],
          { concurrency: 'unbounded' }
        ),
        Effect.tap(verifySharedStreamResults)
      );

    const setupServerAndRunBothClients =
      (
        server: ReadonlyDeep<InMemoryServer>,
        client1Transport: ReadonlyDeep<Server.ClientConnection['transport']>
      ) =>
      (client2Transport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
        pipe(
          createTestServerProtocol(
            server,
            defaultSuccessHandler('test', 1),
            makeEventsByStreamId({ 'shared-stream': sharedStreamEvents })
          ),
          Effect.andThen(runBothClientsSubscription(client1Transport, client2Transport))
        );

    it.effect('should handle multiple clients subscribing to the same stream', () =>
      runTest(({ server, clientTransport: client1Transport }) =>
        pipe(
          server.connector(),
          Effect.flatMap(waitForConnection),
          Effect.flatMap(setupServerAndRunBothClients(server, client1Transport))
        )
      )
    );

    const subscribeToUserStreamForMultipleTest = pipe(
      'user-stream',
      subscribe,
      Effect.flatMap(collectEventStream(2)),
      Effect.map((events) => ({ streamType: 'user', events: Array.from(events) }))
    );

    const subscribeToOrderStream = pipe(
      'order-stream',
      subscribe,
      Effect.flatMap(collectEventStream(1)),
      Effect.map((events) => ({ streamType: 'order', events: Array.from(events) }))
    );

    const subscribeToProductStream = pipe(
      'product-stream',
      subscribe,
      Effect.flatMap(collectEventStream(3)),
      Effect.map((events) => ({ streamType: 'product', events: Array.from(events) }))
    );

    const verifyMultipleStreamResults = (
      streamResults: readonly {
        readonly streamType: string;
        readonly events: readonly Event[];
      }[]
    ) =>
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
      });

    const runMultipleStreamSubscriptions = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        Effect.all(
          [subscribeToUserStreamForMultipleTest, subscribeToOrderStream, subscribeToProductStream],
          { concurrency: 'unbounded' }
        ),
        Effect.tap(verifyMultipleStreamResults),
        Effect.provide(ProtocolLive(clientTransport))
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
        runMultipleStreamSubscriptions
      )
    );

    const collectFirstBatch = pipe(
      'persistent-stream',
      subscribe,
      Effect.flatMap(collectEventStream(2)),
      Effect.map(Array.from<Event>)
    );

    const verifyFirstBatch = (firstBatch: readonly Event[]) =>
      Effect.sync(() => {
        expect(firstBatch).toHaveLength(2);
        expect(firstBatch[0]!.type).toBe('EventBeforeResubscribe1');
        expect(firstBatch[1]!.type).toBe('EventBeforeResubscribe2');
      });

    const collectResubscribeBatch = (firstBatch: readonly Event[]) =>
      pipe(
        'persistent-stream',
        subscribe,
        Effect.flatMap(collectEventStream(4)),
        Effect.map((events) => ({ firstBatch, resubscribeBatch: Array.from(events) }))
      );

    const verifyResubscribeBatch = ({
      resubscribeBatch,
    }: {
      readonly resubscribeBatch: readonly Event[];
    }) =>
      Effect.sync(() => {
        expect(resubscribeBatch).toHaveLength(4);
        expect(resubscribeBatch[0]!.type).toBe('EventBeforeResubscribe1');
        expect(resubscribeBatch[2]!.type).toBe('EventAfterResubscribe1');
        expect(resubscribeBatch[0]!.position.eventNumber).toBe(1);
        expect(resubscribeBatch[3]!.position.eventNumber).toBe(4);
      });

    const verifyFirstBatchAndResubscribe = (firstBatch: readonly Event[]) =>
      pipe(firstBatch, verifyFirstBatch, Effect.andThen(collectResubscribeBatch(firstBatch)));

    const runResubscriptionTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to test resubscription behavior across scope boundaries
        collectFirstBatch,
        Effect.scoped,
        Effect.flatMap(verifyFirstBatchAndResubscribe),
        Effect.tap(verifyResubscribeBatch),
        Effect.provide(ProtocolLive(clientTransport))
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
        runResubscriptionTest
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

    const sendMalformedSuccessWithoutPosition = (
      server: ReadonlyDeep<InMemoryServer>,
      commandId: string
    ) => {
      const malformedMessage = JSON.stringify({
        type: 'command_result',
        commandId: commandId,
        success: true,
      });
      const sleepDuration = Duration.millis(50);
      return pipe(
        sleepDuration,
        Effect.sleep,
        Effect.andThen(sendMalformedMessage(server, malformedMessage))
      );
    };

    const runMalformedSuccessTest = ({
      server,
      clientTransport,
    }: {
      readonly server: ReadonlyDeep<InMemoryServer>;
      readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
    }) => {
      const command = createWireCommand('user-123', 'TestWireCommand', { data: 'test' });
      return pipe(
        Effect.all(
          [
            sendCommandAsEither(command, clientTransport),
            sendMalformedSuccessWithoutPosition(server, command.id),
            TestClock.adjust(Duration.seconds(11)),
          ],
          { concurrency: 'unbounded' }
        ),
        Effect.map(([result, _, __]) => result),
        Effect.tap(verifyTimeoutError(command.id))
      );
    };

    it.effect('should handle malformed command result - success without position', () =>
      pipe(runMalformedSuccessTest, runTest, Effect.provide(TestContext.TestContext))
    );

    const sendMalformedFailureWithoutError = (
      server: ReadonlyDeep<InMemoryServer>,
      commandId: string
    ) => {
      const malformedMessage = JSON.stringify({
        type: 'command_result',
        commandId: commandId,
        success: false,
      });
      const sleepDuration = Duration.millis(50);
      return pipe(
        sleepDuration,
        Effect.sleep,
        Effect.andThen(sendMalformedMessage(server, malformedMessage))
      );
    };

    const runMalformedFailureTest = ({
      server,
      clientTransport,
    }: {
      readonly server: ReadonlyDeep<InMemoryServer>;
      readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
    }) => {
      const command = createWireCommand('user-123', 'TestWireCommand', { data: 'test' });
      return pipe(
        Effect.all(
          [
            sendCommandAsEither(command, clientTransport),
            sendMalformedFailureWithoutError(server, command.id),
            TestClock.adjust(Duration.seconds(11)),
          ],
          { concurrency: 'unbounded' }
        ),
        Effect.map(([result, _, __]) => result),
        Effect.tap(verifyTimeoutError(command.id))
      );
    };

    it.effect('should handle malformed command result - failure without error message', () =>
      pipe(runMalformedFailureTest, runTest, Effect.provide(TestContext.TestContext))
    );
  });

  describe('Transport Failure & Recovery', () => {
    const verifyCommandTimeout = (result: ReadonlyDeep<Either.Either<CommandResult, unknown>>) =>
      Effect.sync(() => {
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(ProtocolCommandTimeoutError);
        }
      });

    const runDisconnectTimeoutTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
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
        Effect.map(([result]) => result),
        Effect.tap(verifyCommandTimeout)
      );

    it.effect('should clean up pending commands when transport disconnects', () =>
      pipe(
        ({
          clientTransport,
        }: {
          readonly clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>;
        }) => runDisconnectTimeoutTest(clientTransport),
        runTest,
        Effect.provide(TestContext.TestContext)
      )
    );

    const verifyTestEventBeforeDisconnect = (events: ReadonlyDeep<Iterable<Event>>) =>
      Effect.sync(() => {
        const eventArray = Array.from(events);
        expect(eventArray).toHaveLength(1);
        expect(eventArray[0]!.type).toBe('TestEvent');
        expect(eventArray[0]!.data).toEqual({ message: 'before disconnect' });
      });

    const verifyTestEventAfterReconnect = (events: ReadonlyDeep<Iterable<Event>>) =>
      Effect.sync(() => {
        const eventArray = Array.from(events);
        expect(eventArray).toHaveLength(1);
        expect(eventArray[0]!.type).toBe('TestEvent');
      });

    const subscribeAndVerifyFirstConnection = pipe(
      'test-stream',
      subscribe,
      Effect.flatMap(collectEventStream(1)),
      Effect.tap(verifyTestEventBeforeDisconnect)
    );

    const subscribeAndVerifyAfterReconnection = pipe(
      'test-stream',
      subscribe,
      Effect.flatMap(collectEventStream(1)),
      Effect.tap(verifyTestEventAfterReconnect)
    );

    const runSubscriptionCleanupTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to verify cleanup behavior between connection cycles
        subscribeAndVerifyFirstConnection,
        Effect.scoped,
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to verify subscription works after reconnection
        Effect.andThen(subscribeAndVerifyAfterReconnection),
        Effect.provide(ProtocolLive(clientTransport))
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
        runSubscriptionCleanupTest
      )
    );

    const sendFirstCommand = (firstTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
      pipe(
        createWireCommand('first-connection', 'TestWireCommand', { data: 'first' }),
        sendWireCommand,
        Effect.tap((result) => Effect.sync(() => expect(isCommandSuccess(result)).toBe(true))),
        Effect.provide(ProtocolLive(firstTransport))
      );

    const verifyNewTransport = (newTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
      Effect.sync(() => {
        expect(newTransport).toBeDefined();
        expect(typeof newTransport.publish).toBe('function');
        expect(typeof newTransport.subscribe).toBe('function');
      });

    const connectNewClientAndVerify = (server: ReadonlyDeep<InMemoryServer>) =>
      pipe(server.connector(), Effect.flatMap(waitForConnection), Effect.tap(verifyNewTransport));

    const runReconnectionSequence = (
      firstTransport: ReadonlyDeep<Server.ClientConnection['transport']>,
      server: ReadonlyDeep<InMemoryServer>
    ) => pipe(firstTransport, sendFirstCommand, Effect.andThen(connectNewClientAndVerify(server)));

    const runReconnectionTest = (
      server: ReadonlyDeep<InMemoryServer>,
      firstTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        createTestServerProtocol(server, (cmd) => ({
          _tag: 'Success',
          position: { streamId: unsafeCreateStreamId(cmd.target), eventNumber: 1 },
        })),
        Effect.andThen(runReconnectionSequence(firstTransport, server))
      );

    it.effect('should handle transport reconnection gracefully', () =>
      runTest(({ server, clientTransport: firstTransport }) =>
        runReconnectionTest(server, firstTransport)
      )
    );
  });

  describe('Server Protocol Integration', () => {
    const listenForWireCommand = (
      serverProtocol: Context.Tag.Service<ServerProtocol>
    ): Effect.Effect<readonly WireCommand[]> =>
      pipe(
        serverProtocol.onWireCommand,
        Stream.take(1),
        Stream.runCollect,
        Effect.map(Array.from<WireCommand>)
      );

    const sendCommandWithProtocol = (
      command: ReadonlyDeep<WireCommand>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(command, sendWireCommand, Effect.provide(ProtocolLive(clientTransport)), Effect.either);

    const sendCommandAsEitherAfterDelay = (
      command: ReadonlyDeep<WireCommand>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const sleepDuration = Duration.millis(50);
      return pipe(
        sleepDuration,
        Effect.sleep,
        Effect.andThen(sendCommandWithProtocol(command, clientTransport))
      );
    };

    const verifyCommandReceivedAndTimedOut =
      (command: ReadonlyDeep<WireCommand>) =>
      (
        results: readonly [
          readonly WireCommand[],
          ReadonlyDeep<Either.Either<CommandResult, unknown>>,
          unknown,
        ]
      ) =>
        Effect.sync(() => {
          const [receivedWireCommands, commandResult] = results;
          expect(receivedWireCommands).toHaveLength(1);

          const receivedWireCommand = receivedWireCommands[0]!;
          expect(receivedWireCommand.id).toBe(command.id);
          expect(receivedWireCommand.target).toBe(command.target);
          expect(receivedWireCommand.name).toBe(command.name);
          expect(receivedWireCommand.payload).toEqual(command.payload);

          expect(Either.isLeft(commandResult)).toBe(true);
          if (Either.isLeft(commandResult)) {
            expect(commandResult.left).toBeInstanceOf(ProtocolCommandTimeoutError);
          }
        });

    const runServerProtocolCommandTest = (
      serverProtocol: Context.Tag.Service<ServerProtocol>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const command: WireCommand = {
        id: crypto.randomUUID(),
        target: 'user-123',
        name: 'CreateUser',
        payload: { name: 'Alice', email: 'alice@example.com' },
      };

      return pipe(
        Effect.all(
          [
            listenForWireCommand(serverProtocol),
            sendCommandAsEitherAfterDelay(command, clientTransport),
            TestClock.adjust(Duration.seconds(11)),
          ],
          { concurrency: 'unbounded' }
        ),
        Effect.tap(verifyCommandReceivedAndTimedOut(command))
      );
    };

    const runServerProtocolTest = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        ServerProtocol,
        Effect.flatMap((serverProtocol) =>
          runServerProtocolCommandTest(serverProtocol, clientTransport)
        ),
        Effect.provide(ServerProtocolLive(server))
      );

    it.effect('should emit commands through server protocol onWireCommand stream', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          runServerProtocolTest(server, clientTransport)
        ),
        Effect.scoped,
        Effect.provide(TestContext.TestContext)
      )
    );

    const sendCommandViaProtocol = (
      command: ReadonlyDeep<WireCommand>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => pipe(command, sendWireCommand, Effect.provide(ProtocolLive(clientTransport)));

    const verifyReceivedCommandMatches = (
      command: ReadonlyDeep<WireCommand>,
      receivedWireCommand: WireCommand
    ) =>
      Effect.sync(() => {
        expect(receivedWireCommand.id).toBe(command.id);
        expect(receivedWireCommand.target).toBe(command.target);
        expect(receivedWireCommand.name).toBe(command.name);
      });

    const verifyCommandAndSendResult = (
      serverProtocol: Context.Tag.Service<ServerProtocol>,
      command: ReadonlyDeep<WireCommand>,
      receivedWireCommand: WireCommand,
      successResult: ReadonlyDeep<CommandResult>
    ) =>
      pipe(
        verifyReceivedCommandMatches(command, receivedWireCommand),
        Effect.andThen(serverProtocol.sendResult(receivedWireCommand.id, successResult))
      );

    const processCommandAndSendResult = (
      serverProtocol: Context.Tag.Service<ServerProtocol>,
      command: ReadonlyDeep<WireCommand>,
      successResult: ReadonlyDeep<CommandResult>
    ) =>
      pipe(
        serverProtocol.onWireCommand,
        Stream.take(1),
        Stream.runCollect,
        Effect.flatMap((commands) => {
          const receivedWireCommand = Array.from(commands)[0]!;
          return verifyCommandAndSendResult(
            serverProtocol,
            command,
            receivedWireCommand,
            successResult
          );
        })
      );

    const verifyClientResult = (results: readonly [CommandResult, void]) =>
      Effect.sync(() => {
        const [clientResult] = results;
        expect(isCommandSuccess(clientResult)).toBe(true);
        if (isCommandSuccess(clientResult)) {
          expect(clientResult.position.streamId).toEqual(unsafeCreateStreamId('user-456'));
          expect(clientResult.position.eventNumber).toBe(99);
        }
      });

    const runSendResultTest = (
      serverProtocol: Context.Tag.Service<ServerProtocol>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
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
            sendCommandViaProtocol(command, clientTransport),
            processCommandAndSendResult(serverProtocol, command, successResult),
          ],
          { concurrency: 'unbounded' }
        ),
        Effect.tap(verifyClientResult)
      );
    };

    const runServerSendResultTest = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        ServerProtocol,
        Effect.flatMap((serverProtocol) => runSendResultTest(serverProtocol, clientTransport)),
        Effect.provide(ServerProtocolLive(server))
      );

    it.effect('should deliver command results via server protocol sendResult', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          runServerSendResultTest(server, clientTransport)
        ),
        Effect.scoped
      )
    );

    const collectProductEvents = <E, R>(eventStream: Stream.Stream<Event, E, R>) =>
      pipe(eventStream, Stream.take(1), Stream.runCollect, Effect.map(Array.from<Event>));

    const verifyProductEvent = (receivedEvents: readonly Event[]) =>
      Effect.sync(() => {
        expect(receivedEvents).toHaveLength(1);

        const receivedEvent = receivedEvents[0]!;
        expect(receivedEvent.type).toBe('ProductCreated');
        expect(receivedEvent.position.streamId).toEqual(unsafeCreateStreamId('product-789'));
        expect(receivedEvent.position.eventNumber).toBe(42);
        expect(receivedEvent.data).toEqual({
          id: 'product-789',
          name: 'Super Widget',
          price: 99.99,
          category: 'electronics',
        });
        expect(receivedEvent.timestamp).toEqual(new Date('2024-01-15T14:30:00Z'));
      });

    const subscribeAndVerifyProductEvents = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        'product-789',
        subscribe,
        Effect.flatMap(collectProductEvents),
        Effect.tap(verifyProductEvent),
        Effect.provide(ProtocolLive(clientTransport))
      );

    const productStreamHandler = (streamId: string) => {
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
    };

    const runPublishEventTest = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        createTestServerProtocol(server, undefined, productStreamHandler),
        Effect.andThen(subscribeAndVerifyProductEvents(clientTransport))
      );

    it.effect('should publish events via server protocol publishEvent', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          runPublishEventTest(server, clientTransport)
        ),
        Effect.scoped
      )
    );
  });

  describe('Edge Cases', () => {
    const verifyDuplicateCommandResults = (
      results: readonly [
        ReadonlyDeep<Either.Either<CommandResult, unknown>>,
        ReadonlyDeep<Either.Either<CommandResult, unknown>>,
      ]
    ) =>
      Effect.sync(() => {
        const [result1, result2] = results;
        expect(Either.isRight(result1!)).toBe(true);
        expect(Either.isRight(result2!)).toBe(true);
        if (Either.isRight(result1!) && Either.isRight(result2!)) {
          expect(isCommandSuccess(result1!.right)).toBe(true);
          expect(isCommandSuccess(result2!.right)).toBe(true);
          if (isCommandSuccess(result1!.right) && isCommandSuccess(result2!.right)) {
            expect(result1!.right.position.eventNumber).toBe(42);
            expect(result2!.right.position.eventNumber).toBe(42);
            expect(result1!.right.position.streamId).toEqual(result2!.right.position.streamId);
          }
        }
      });

    const runDuplicateCommandTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const duplicateId = crypto.randomUUID();
      const command1 = {
        ...createWireCommand('user-123', 'CreateUser', { name: 'Alice' }),
        id: duplicateId,
      };
      const command2 = {
        ...createWireCommand('user-456', 'CreateUser', { name: 'Bob' }),
        id: duplicateId,
      };

      const runCommands = pipe(
        Effect.all(
          [
            sendCommandAsEither(command1, clientTransport),
            sendCommandAsEither(command2, clientTransport),
          ],
          { concurrency: 'unbounded' }
        )
      );

      const adjustClock = TestClock.adjust(Duration.millis(100));

      return pipe(
        Effect.all([runCommands, adjustClock], { concurrency: 'unbounded' }),
        Effect.flatMap(([results]) => verifyDuplicateCommandResults(results))
      );
    };

    it.effect('should handle duplicate command IDs appropriately', () =>
      pipe(
        runTestWithProtocol(
          (command) => ({
            _tag: 'Success',
            position: { streamId: unsafeCreateStreamId(command.target), eventNumber: 42 },
          }),
          runDuplicateCommandTest
        ),
        Effect.provide(TestContext.TestContext)
      )
    );

    const verifyLargeCommandResult = (result: ReadonlyDeep<CommandResult>) =>
      Effect.sync(() => {
        expect(isCommandSuccess(result)).toBe(true);
        if (isCommandSuccess(result)) {
          expect(result.position.streamId).toEqual(unsafeCreateStreamId('bulk-stream'));
          expect(result.position.eventNumber).toBe(1);
        }
      });

    const sendLargeCommand = (command: ReadonlyDeep<WireCommand>) =>
      pipe(command, sendWireCommand, Effect.tap(verifyLargeCommandResult));

    const verifyLargeEventData = (collectedEvents: ReadonlyDeep<Iterable<Event>>) =>
      Effect.sync(() => {
        const events = Array.from(collectedEvents);
        expect(events).toHaveLength(1);

        const event = events[0]!;
        expect(event.type).toBe('LargeDataEvent');
        expect(event.position.eventNumber).toBe(1);

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

        expect(Object.keys(data.metadata.attributes)).toHaveLength(50);
        expect(data.metadata.attributes['attr-0']).toBe('value-0'.repeat(20));
      });

    const collectAndVerifyLargeEvents = <E, R>(eventStream: Stream.Stream<Event, E, R>) =>
      pipe(eventStream, Stream.take(1), Stream.runCollect, Effect.tap(verifyLargeEventData));

    const subscribeToBulkStreamAndVerify = pipe(
      'bulk-stream',
      subscribe,
      Effect.flatMap(collectAndVerifyLargeEvents)
    );

    const runLargePayloadTest = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
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
        Effect.all([sendLargeCommand(command), subscribeToBulkStreamAndVerify], {
          concurrency: 'unbounded',
        }),
        Effect.provide(ProtocolLive(clientTransport))
      );
    };

    const largeEventStreamHandler = (streamId: string) => {
      const largeData = {
        description: 'A'.repeat(10000),
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
    };

    const setupLargePayloadServer = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
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
          largeEventStreamHandler
        ),
        Effect.andThen(runLargePayloadTest(clientTransport))
      );

    it.effect('should handle very large payloads in commands and events', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          setupLargePayloadServer(server, clientTransport)
        ),
        Effect.scoped
      )
    );

    const collectCycleEvent = <E, R>(eventStream: Stream.Stream<Event, E, R>) =>
      pipe(
        eventStream,
        Stream.take(1),
        Stream.runCollect,
        Effect.map((events) => ({
          cycleNumber: -1,
          eventCount: Array.from(events).length,
          firstEvent: Array.from(events)[0],
        }))
      );

    const performSubscriptionCycle = (cycleNumber: number) =>
      pipe(
        `cycle-stream-${cycleNumber}`,
        subscribe,
        Effect.flatMap(collectCycleEvent),
        Effect.scoped,
        Effect.map((result) => ({ ...result, cycleNumber }))
      );

    const verifyCycleResults = (
      results: readonly {
        readonly cycleNumber: number;
        readonly eventCount: number;
        readonly firstEvent: Event | undefined;
      }[]
    ) =>
      Effect.sync(() => {
        expect(results).toHaveLength(10);

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

        const extractStreamId = (result: {
          readonly cycleNumber: number;
          readonly eventCount: number;
          readonly firstEvent: Event | undefined;
        }) => {
          const data = result.firstEvent?.data;
          if (data && typeof data === 'object' && 'streamId' in data) {
            return data.streamId;
          }
          return undefined;
        };

        const uniqueStreamIds = new Set(results.map(extractStreamId));
        expect(uniqueStreamIds.size).toBe(10);

        Array.from({ length: 10 }, (_, i) => i).forEach((i) => {
          expect(uniqueStreamIds.has(`cycle-stream-${i}`)).toBe(true);
        });
      });

    const runRapidCycles = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const cycles = Array.from({ length: 10 }, (_, i) => performSubscriptionCycle(i));

      return pipe(
        Effect.all(cycles, { concurrency: 'unbounded' }),
        Effect.tap(verifyCycleResults),
        Effect.provide(ProtocolLive(clientTransport))
      );
    };

    const cycleEventHandler = (streamId: string) => [
      {
        position: { streamId: unsafeCreateStreamId(streamId), eventNumber: 1 },
        type: 'CycleTestEvent',
        data: { streamId, cycle: true },
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
    ];

    const setupRapidCycleTest = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        createTestServerProtocol(
          server,
          () => ({
            _tag: 'Success',
            position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
          }),
          cycleEventHandler
        ),
        Effect.andThen(runRapidCycles(clientTransport))
      );

    it.effect('should handle rapid subscription/unsubscription cycles', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          setupRapidCycleTest(server, clientTransport)
        ),
        Effect.scoped
      )
    );
  });

  describe('Basic Cleanup', () => {
    const drainEventStreamPipe = <E, R>(eventStream: Stream.Stream<Event, E, R>) =>
      pipe(eventStream, Stream.take(0), Stream.runDrain);

    const subscribeAndDrainUser123 = pipe(
      'user-123',
      subscribe,
      Effect.flatMap(drainEventStreamPipe)
    );

    const subscribeAndDrainUser456 = pipe(
      'user-456',
      subscribe,
      Effect.flatMap(drainEventStreamPipe)
    );

    const runCleanupTest = (clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>) =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to test subscription cleanup across scope boundaries
        subscribeAndDrainUser123,
        Effect.scoped,
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to verify new subscription works after previous cleanup
        Effect.andThen(subscribeAndDrainUser456),
        Effect.provide(ProtocolLive(clientTransport))
      );

    it.effect('should clean up subscriptions when stream scope ends', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ clientTransport }) => runCleanupTest(clientTransport)),
        Effect.scoped
      )
    );

    const verifySequentialResults = (results: ReadonlyDeep<Iterable<CommandResult>>) =>
      Effect.sync(() => {
        const resultsArray = Array.from(results);
        expect(resultsArray).toHaveLength(5);
        resultsArray.forEach((result, index) => {
          expect(isCommandSuccess(result)).toBe(true);
          if (isCommandSuccess(result)) {
            expect(result.position.streamId).toEqual(unsafeCreateStreamId(`user-${index + 1}`));
            expect(result.position.eventNumber).toBeGreaterThan(0);
            expect(result.position.eventNumber).toBeLessThanOrEqual(100);
          }
        });
      });

    const sendSequentialCommands = (
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) => {
      const commands: readonly WireCommand[] = Array.from({ length: 5 }, (_, i) => ({
        id: crypto.randomUUID(),
        target: `user-${i + 1}`,
        name: 'SequentialWireCommand',
        payload: { sequence: i + 1, data: `test-data-${i + 1}` },
      }));

      return pipe(
        Effect.forEach(commands, sendWireCommand, { concurrency: 1 }),
        Effect.tap(verifySequentialResults),
        Effect.provide(ProtocolLive(clientTransport))
      );
    };

    const runSequentialCommandsTest = (
      server: ReadonlyDeep<InMemoryServer>,
      clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
    ) =>
      pipe(
        createTestServerProtocol(server, (command) => ({
          _tag: 'Success',
          position: {
            streamId: unsafeCreateStreamId(command.target),
            eventNumber: Math.floor(Math.random() * 100) + 1,
          },
        })),
        Effect.andThen(sendSequentialCommands(clientTransport))
      );

    it.effect('should handle multiple sequential commands after cleanup', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          runSequentialCommandsTest(server, clientTransport)
        ),
        Effect.scoped
      )
    );
  });

  describe('Effect Span Context Propagation', () => {
    const handleServerCommand = (
      serverProtocol: Effect.Effect.Success<typeof ServerProtocol>,
      clientTransport: ReadonlyDeep<Client.Transport>,
      clientTraceId: string
    ) => {
      const testCommand = {
        id: 'test-cmd',
        target: 'test',
        name: 'TestCommand',
        payload: {},
      };

      const verifySpanAndSendResultForCommand = (commands: ReadonlyDeep<Iterable<WireCommand>>) =>
        pipe(
          Effect.currentSpan,
          Effect.flatMap((serverSpan) =>
            Effect.sync(() => {
              expect(serverSpan.traceId).toBe(clientTraceId);
              if (serverSpan.traceId !== clientTraceId) {
                throw new Error(
                  `Server span traceId mismatch: expected client traceId "${clientTraceId}" but got "${serverSpan.traceId}". ` +
                    `This means the server is not restoring the trace context from the incoming ProtocolCommand.`
                );
              }
              expect(serverSpan.spanId).not.toBe(clientTraceId);
              if (serverSpan.spanId === clientTraceId) {
                throw new Error(
                  `Server span should be a child span with different spanId, but got same spanId "${serverSpan.spanId}". ` +
                    `This means the server is not creating a new child span.`
                );
              }
            })
          ),
          Effect.andThen(
            serverProtocol.sendResult(Array.from(commands)[0]!.id, {
              _tag: 'Success',
              position: { streamId: unsafeCreateStreamId('test'), eventNumber: 1 },
            })
          ),
          Effect.timeout(Duration.millis(100)),
          Effect.catchTag('TimeoutException', () =>
            Effect.fail(
              new Error(
                'Test timed out waiting for server to process command. ' +
                  'This likely means the server is not restoring trace context from the ProtocolCommand, ' +
                  'so Effect.currentSpan is waiting indefinitely for a span that never gets created.'
              )
            )
          )
        );

      const processFirstCommand = pipe(
        Stream.take(serverProtocol.onWireCommand, 1),
        Stream.runCollect,
        Effect.flatMap(verifySpanAndSendResultForCommand),
        Effect.fork
      );

      const sendCommandWithSpan = (clientSpan: Tracer.Span) =>
        pipe(
          testCommand,
          sendWireCommand,
          Effect.provide(ProtocolLive(clientTransport)),
          Effect.tap(() =>
            Effect.sync(() => {
              expect(clientSpan.traceId).toBeTruthy();
              expect(clientSpan.spanId).toBeTruthy();
            })
          )
        );

      const clientWork = pipe(
        Effect.currentSpan,
        Effect.flatMap(sendCommandWithSpan),
        Effect.withSpan('client-test-span')
      );

      // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test pattern: effect stored to fork server-side command processing
      return pipe(processFirstCommand, Effect.andThen(clientWork));
    };

    const runServerProtocolWithTraceId = (
      server: ReadonlyDeep<Server.Transport>,
      clientTransport: ReadonlyDeep<Client.Transport>,
      clientSpan: Tracer.Span
    ) =>
      pipe(
        ServerProtocol,
        Effect.flatMap((serverProtocol) =>
          handleServerCommand(serverProtocol, clientTransport, clientSpan.traceId)
        ),
        Effect.provide(ServerProtocolLive(server))
      );

    const runTestWithServerProtocol = (
      server: ReadonlyDeep<Server.Transport>,
      clientTransport: ReadonlyDeep<Client.Transport>
    ) =>
      pipe(
        Effect.currentSpan,
        Effect.flatMap((clientSpan) =>
          runServerProtocolWithTraceId(server, clientTransport, clientSpan)
        ),
        Effect.withSpan('test-client-span')
      );

    it.effect('client span context should propagate through protocol layer', () =>
      pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Test helper: setupTestEnvironment is reused across multiple test cases for consistency
        setupTestEnvironment,
        Effect.flatMap(({ server, clientTransport }) =>
          runTestWithServerProtocol(server, clientTransport)
        ),
        Effect.scoped,
        Effect.provide(TestContext.TestContext),
        Effect.timeout(Duration.millis(500)),
        Effect.catchTag('TimeoutException', () =>
          Effect.fail(
            new Error(
              'Overall test timed out. The server is likely not restoring trace context from incoming commands.'
            )
          )
        )
      )
    );
  });

  describe('OpenTelemetry Semantic Conventions', () => {
    it.effect('command operations create spans following RPC conventions', () => {
      const command = createWireCommand('user-123', 'CreateUser', { name: 'Alice' });

      const runCommandWithTracing = (
        clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
      ) =>
        pipe(
          command,
          sendWireCommand,
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(isCommandSuccess(result)).toBe(true);
            })
          ),
          Effect.provide(ProtocolLive(clientTransport))
        );

      return runTestWithProtocol(defaultSuccessHandler('user-123', 1), runCommandWithTracing);
    });

    it.effect('subscribe operations create spans following RPC conventions', () => {
      const streamId = 'test-stream';

      const runSubscribeWithTracing = (
        clientTransport: ReadonlyDeep<Server.ClientConnection['transport']>
      ) =>
        pipe(
          streamId,
          subscribe,
          Effect.flatMap(drainEventStream),
          Effect.provide(ProtocolLive(clientTransport))
        );

      return runTestWithProtocol(defaultSuccessHandler('test', 1), runSubscribeWithTracing);
    });
  });
});
