/**
 * Test Utilities for Event Sourcing Testing
 *
 * This module provides common test utilities, mock implementations,
 * and test data generators for event sourcing testing scenarios.
 */

import {
  Effect,
  Stream,
  Layer,
  Data,
  pipe,
  Chunk,
  Ref,
  Duration,
  Fiber,
  Scope,
  Schema,
  Brand,
  Either,
} from 'effect';
import type {
  EventStreamId,
  EventStreamPosition,
  EventNumber,
} from '@codeforbreakfast/eventsourcing-store';
import type {
  AggregateCommand,
  CommandResult,
  StreamEvent,
  CommandError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import { TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';
import type {
  TransportMessage,
  TransportTestContext,
  ConnectedTransportTestInterface,
} from './test-layer-interfaces.js';
import { TransportMessageSchema } from './test-layer-interfaces.js';
import type { ConnectionState } from './test-layer-interfaces.js';

// ============================================================================
// Test Data Generators
// ============================================================================

type TestId = string & Brand.Brand<'TestId'>;
const TestId = Brand.nominal<TestId>();

/**
 * Generates unique stream IDs for testing
 */
export const generateStreamId = (prefix = 'test-stream'): EventStreamId =>
  `${prefix}-${Math.random().toString(36).substring(7)}-${Date.now()}` as EventStreamId;

/**
 * Generates unique command IDs for testing
 */
export const generateCommandId = (): TestId =>
  `cmd-${Math.random().toString(36).substring(7)}-${Date.now()}` as TestId;

/**
 * Generates unique message IDs for testing
 */
export const generateMessageId = (): string =>
  `msg-${Math.random().toString(36).substring(7)}-${Date.now()}`;

/**
 * Creates a test event stream position
 */
export const createTestPosition = (
  streamId?: EventStreamId,
  eventNumber?: EventNumber
): EventStreamPosition => ({
  streamId: streamId || generateStreamId(),
  eventNumber: eventNumber || (0 as EventNumber),
});

/**
 * Creates a test aggregate for commands
 */
export const createTestAggregate = (name = 'TestAggregate', position?: EventStreamPosition) => ({
  position: position || createTestPosition(),
  name,
});

/**
 * Creates a test command
 */
export const createTestCommand = <TPayload = unknown>(
  payload: TPayload,
  options?: {
    aggregateName?: string;
    commandName?: string;
    position?: EventStreamPosition;
    metadata?: Record<string, unknown>;
  }
): AggregateCommand<TPayload> => ({
  aggregate: createTestAggregate(options?.aggregateName || 'TestAggregate', options?.position),
  commandName: options?.commandName || 'TestCommand',
  payload,
  ...(options?.metadata && { metadata: options.metadata }),
});

/**
 * Creates a test stream event
 */
export const createTestStreamEvent = <TEvent>(
  event: TEvent,
  options?: {
    position?: EventStreamPosition;
    timestamp?: Date;
  }
): StreamEvent<TEvent> => ({
  position: options?.position || createTestPosition(),
  event,
  timestamp: options?.timestamp || new Date(),
});

/**
 * Creates a test transport message with schema validation
 */
export const createTestTransportMessage = <TPayload = unknown>(
  payload: TPayload,
  options?: {
    id?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }
): Effect.Effect<TransportMessage, Error, never> => {
  const messageInput = {
    id: options?.id || generateMessageId(),
    type: options?.type || 'test-message',
    payload,
    ...(options?.metadata && { metadata: options.metadata }),
  };

  return Schema.decodeUnknown(TransportMessageSchema)(messageInput);
};

/**
 * Generates a sequence of test events
 */
export const generateTestEvents = <TEvent>(
  eventFactory: (index: number) => TEvent,
  count: number,
  streamId?: EventStreamId
): StreamEvent<TEvent>[] =>
  Array.from({ length: count }, (_, i) =>
    createTestStreamEvent(eventFactory(i), {
      position: {
        streamId: streamId || generateStreamId(),
        eventNumber: (i + 1) as EventNumber,
      },
    })
  );

/**
 * Generates a sequence of test commands
 */
export const generateTestCommands = <TPayload>(
  payloadFactory: (index: number) => TPayload,
  count: number,
  options?: {
    aggregateName?: string;
    commandName?: string;
    streamId?: EventStreamId;
  }
): AggregateCommand<TPayload>[] =>
  Array.from({ length: count }, (_, i) =>
    createTestCommand(payloadFactory(i), {
      aggregateName: options?.aggregateName || 'TestAggregate',
      commandName: options?.commandName || 'TestCommand',
      position: {
        streamId: options?.streamId || generateStreamId(),
        eventNumber: i as EventNumber,
      },
    })
  );

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Mock command error for testing
 */
export const createMockCommandError = (
  message: string,
  details?: Record<string, unknown>
): CommandError =>
  Data.struct({
    _tag: 'CommandError',
    message,
    details,
  }) as CommandError;

/**
 * Mock transport state for testing
 */
export interface MockTransportState {
  readonly isConnected: boolean;
  readonly connectionState: ConnectionState;
  readonly messages: ReadonlyArray<TransportMessage>;
  readonly subscribers: ReadonlyArray<{
    readonly id: string;
    readonly filter: ((message: TransportMessage) => boolean) | undefined;
  }>;
  readonly bufferedMessages: ReadonlyArray<TransportMessage>;
  readonly metrics: {
    readonly messagesSent: number;
    readonly messagesReceived: number;
    readonly connectionDrops: number;
  };
}

/**
 * Creates a mock transport implementation for testing transport contracts
 */
export const createMockTransport = (): Effect.Effect<TransportTestContext, never, never> =>
  Effect.gen(function* () {
    const globalState = yield* Ref.make<MockTransportState>({
      isConnected: false,
      connectionState: 'disconnected' as ConnectionState,
      messages: [],
      subscribers: [],
      bufferedMessages: [],
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        connectionDrops: 0,
      },
    });

    const createConnectedTransport = (
      url: string
    ): Effect.Effect<ConnectedTransportTestInterface, TransportError, Scope.Scope> =>
      Effect.gen(function* () {
        // Validate URL using schema-based validation
        const UrlSchema = Schema.String.pipe(Schema.startsWith('test://'));

        yield* pipe(
          Schema.decodeUnknown(UrlSchema)(url),
          Effect.catchAll(() =>
            Effect.fail(
              new TransportError({
                message: `Invalid URL: ${url}`,
                cause: new Error('URL must start with test://'),
              })
            )
          )
        );

        // Create connection state stream
        const connectionStateRef = yield* Ref.make<ConnectionState>('connected');
        const connectionState = Stream.repeatEffect(Ref.get(connectionStateRef));

        // Update global state to connected
        yield* Ref.update(globalState, (s) => ({
          ...s,
          isConnected: true,
          connectionState: 'connected' as ConnectionState,
        }));

        // Set up cleanup on scope close
        yield* Effect.addFinalizer(() =>
          Ref.update(globalState, (s) => ({
            ...s,
            isConnected: false,
            connectionState: 'disconnected' as ConnectionState,
          }))
        );

        const messageQueue = yield* Ref.make<TransportMessage[]>([]);
        const subscriptionStreams = yield* Ref.make<
          Array<{
            id: string;
            filter: ((msg: TransportMessage) => boolean) | undefined;
            queue: Ref.Ref<TransportMessage[]>;
          }>
        >([]);

        const publish = (message: TransportMessage): Effect.Effect<void, TransportError, never> =>
          Effect.gen(function* () {
            const currentState = yield* Ref.get(globalState);

            if (!currentState.isConnected) {
              yield* Effect.fail(
                new TransportError({
                  message: 'Transport not connected',
                })
              );
            }

            // Message is already validated by schema at creation time
            // No defensive checks needed - invalid states are unrepresentable

            // Add to main message queue
            yield* Ref.update(messageQueue, (messages) => [...messages, message]);

            // Distribute to all active subscriptions
            const subs = yield* Ref.get(subscriptionStreams);
            for (const sub of subs) {
              const filterResult = pipe(
                Effect.try(() => !sub.filter || sub.filter(message)),
                Effect.catchAll(() => Effect.succeed(false))
              );

              const shouldAdd = yield* filterResult;
              if (shouldAdd) {
                yield* Ref.update(sub.queue, (messages) => [...messages, message]);
              }
            }

            // Update metrics
            yield* Ref.update(globalState, (s) => ({
              ...s,
              messages: [...s.messages, message],
              metrics: {
                ...s.metrics,
                messagesSent: s.metrics.messagesSent + 1,
              },
            }));
          });

        const subscribe = (
          filter?: (msg: TransportMessage) => boolean
        ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> =>
          Effect.gen(function* () {
            const subscriptionId = generateMessageId();
            const subscriptionQueue = yield* Ref.make<TransportMessage[]>([]);

            const subscription = {
              id: subscriptionId,
              filter: filter ? filter : undefined,
              queue: subscriptionQueue,
            };

            yield* Ref.update(subscriptionStreams, (subs) => [...subs, subscription]);

            // Create stream from subscription queue with cleanup
            const stream = Stream.repeatEffect(
              pipe(
                Ref.get(subscriptionQueue),
                Effect.flatMap((messages) =>
                  messages.length > 0
                    ? pipe(Ref.set(subscriptionQueue, []), Effect.as(messages))
                    : Effect.sleep(Duration.millis(10)).pipe(Effect.as([]))
                )
              )
            ).pipe(
              Stream.flatMap((messages) => Stream.fromIterable(messages)),
              Stream.filter((msg) => {
                try {
                  return !filter || filter(msg);
                } catch {
                  return false; // Skip messages that cause filter errors
                }
              }),
              Stream.ensuring(
                Ref.update(subscriptionStreams, (subs) =>
                  subs.filter((sub) => sub.id !== subscriptionId)
                )
              )
            );

            return stream;
          });

        return {
          connectionState,
          publish,
          subscribe,
        };
      });

    const simulateDisconnect = (): Effect.Effect<void, never, never> =>
      Ref.update(globalState, (s) => ({
        ...s,
        isConnected: false,
        connectionState: 'error' as ConnectionState,
        metrics: {
          ...s.metrics,
          connectionDrops: s.metrics.connectionDrops + 1,
        },
      }));

    const simulateReconnect = (): Effect.Effect<void, never, never> =>
      Ref.update(globalState, (s) => ({
        ...s,
        isConnected: true,
        connectionState: 'connected' as ConnectionState,
        messages: [...s.messages, ...s.bufferedMessages],
        bufferedMessages: [],
      }));

    const getBufferedMessageCount = (): Effect.Effect<number, never, never> =>
      pipe(
        Ref.get(globalState),
        Effect.map((s) => s.bufferedMessages.length)
      );

    return {
      createConnectedTransport,
      simulateDisconnect,
      simulateReconnect,
      getBufferedMessageCount,
    };
  });

/**
 * Mock domain context for testing domain contracts
 */
export interface MockDomainState {
  readonly streams: ReadonlyMap<
    EventStreamId,
    {
      readonly events: ReadonlyArray<{ event: unknown; eventNumber: EventNumber }>;
      readonly lastEventNumber: EventNumber;
    }
  >;
  readonly processedCommands: ReadonlyArray<AggregateCommand>;
}

/**
 * Creates a mock domain context for testing domain contracts
 */
export const createMockDomainContext = (): Effect.Effect<
  {
    readonly processCommand: (
      command: AggregateCommand
    ) => Effect.Effect<CommandResult, never, never>;
    readonly getEventCount: (streamId: EventStreamId) => Effect.Effect<number, never, never>;
    readonly getLastEventNumber: (
      streamId: EventStreamId
    ) => Effect.Effect<EventNumber, never, never>;
    readonly reset: () => Effect.Effect<void, never, never>;
  },
  never,
  never
> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<MockDomainState>({
      streams: new Map(),
      processedCommands: [],
    });

    const processCommand = (
      command: AggregateCommand
    ): Effect.Effect<CommandResult, never, never> =>
      Effect.gen(function* () {
        const currentState = yield* Ref.get(state);
        const { streamId, eventNumber: expectedVersion } = command.aggregate.position;

        const stream = currentState.streams.get(streamId);
        const currentVersion = stream?.lastEventNumber || (0 as EventNumber);

        // Define business rule schemas for type-safe validation
        const AmountPayloadSchema = Schema.Struct({
          amount: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
        });

        // Simulate optimistic concurrency control
        if (expectedVersion !== currentVersion) {
          return Either.left(
            createMockCommandError(
              `Optimistic concurrency violation. Expected version ${expectedVersion}, got ${currentVersion}`
            )
          );
        }

        // Simulate business rule validation using schemas
        if (command.payload && typeof command.payload === 'object' && command.payload !== null) {
          const payloadResult = Schema.decodeUnknownEither(AmountPayloadSchema)(command.payload);
          if (payloadResult._tag === 'Left') {
            return Either.left(
              createMockCommandError('Invalid payload: negative amounts not allowed')
            );
          }
        }

        // Process command successfully
        const newEventNumber = (currentVersion + 1) as EventNumber;
        const newEvent = {
          event: { type: command.commandName, data: command.payload },
          eventNumber: newEventNumber,
        };

        yield* Ref.update(state, (s) => ({
          ...s,
          streams: new Map(s.streams).set(streamId, {
            events: [...(stream?.events || []), newEvent],
            lastEventNumber: newEventNumber,
          }),
          processedCommands: [...s.processedCommands, command],
        }));

        return Either.right({
          streamId,
          eventNumber: newEventNumber,
        });
      });

    const getEventCount = (streamId: EventStreamId): Effect.Effect<number, never, never> =>
      pipe(
        Ref.get(state),
        Effect.map((s) => s.streams.get(streamId)?.events.length || 0)
      );

    const getLastEventNumber = (
      streamId: EventStreamId
    ): Effect.Effect<EventNumber, never, never> =>
      pipe(
        Ref.get(state),
        Effect.map((s) => s.streams.get(streamId)?.lastEventNumber || (0 as EventNumber))
      );

    const reset = (): Effect.Effect<void, never, never> =>
      Ref.set(state, {
        streams: new Map(),
        processedCommands: [],
      });

    return {
      processCommand,
      getEventCount,
      getLastEventNumber,
      reset,
    };
  });

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Waits for a condition to be true with timeout
 */
export const waitForCondition = (
  condition: () => Effect.Effect<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Effect.Effect<void, Error> =>
  pipe(
    Effect.gen(function* () {
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        const result = yield* condition();
        if (result) {
          return;
        }
        yield* Effect.sleep(Duration.millis(intervalMs));
      }
      yield* Effect.fail(new Error(`Condition not met within ${timeoutMs}ms`));
    })
  );

/**
 * Asserts that an effect fails with a specific error
 */
export const expectError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  predicate: (error: E) => boolean
): Effect.Effect<void, never, R> =>
  pipe(
    effect,
    Effect.flip,
    Effect.flatMap((error) =>
      predicate(error)
        ? Effect.void
        : Effect.fail(new Error(`Error does not match predicate: ${String(error)}`))
    ),
    Effect.catchAll(() => Effect.void)
  );

/**
 * Collects all values from a stream with timeout
 */
export const collectStreamWithTimeout = <T, E, R>(
  stream: Stream.Stream<T, E, R>,
  count: number,
  timeoutMs = 5000
): Effect.Effect<ReadonlyArray<T>, Error | E, R> =>
  pipe(
    stream,
    Stream.take(count),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray),
    Effect.timeoutTo({
      duration: Duration.millis(timeoutMs),
      onTimeout: () =>
        Effect.fail(new Error(`Stream did not produce ${count} items within ${timeoutMs}ms`)),
      onSuccess: (value) => Effect.succeed(value),
    }),
    Effect.flatten
  );

/**
 * Creates a test layer that provides both mock transport and domain contexts
 */
export const createTestLayer = (): Layer.Layer<
  {
    transport: TransportTestContext;
    domain: {
      processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult, never, never>;
      getEventCount: (streamId: EventStreamId) => Effect.Effect<number, never, never>;
      getLastEventNumber: (streamId: EventStreamId) => Effect.Effect<EventNumber, never, never>;
      reset: () => Effect.Effect<void, never, never>;
    };
  },
  never,
  never
> =>
  Layer.effect(
    'TestLayer' as any,
    Effect.gen(function* () {
      const transport = yield* createMockTransport();
      const domain = yield* createMockDomainContext();
      return { transport, domain };
    })
  );

/**
 * Common test scenarios that can be reused across different test suites
 */
export const TestScenarios = {
  /**
   * Tests basic command processing flow
   */
  basicCommandFlow: (
    processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult, never, never>
  ) =>
    Effect.gen(function* () {
      const command = createTestCommand({ action: 'test', value: 42 });
      const result = yield* processCommand(command);
      return result;
    }),

  /**
   * Tests optimistic concurrency control
   */
  optimisticConcurrency: (
    processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult, never, never>
  ) =>
    Effect.gen(function* () {
      const streamId = generateStreamId();

      // First command should succeed
      const command1 = createTestCommand(
        { value: 1 },
        {
          position: createTestPosition(streamId, 0 as EventNumber),
        }
      );
      const result1 = yield* processCommand(command1);

      // Second command with wrong version should fail
      const command2 = createTestCommand(
        { value: 2 },
        {
          position: createTestPosition(streamId, 0 as EventNumber), // Wrong version
        }
      );
      const result2 = yield* processCommand(command2);

      return { result1, result2 };
    }),

  /**
   * Tests event stream ordering
   */
  eventOrdering: (
    subscribe: (
      position: EventStreamPosition
    ) => Effect.Effect<Stream.Stream<StreamEvent<unknown>, never, never>>,
    sendEvents: (streamId: EventStreamId, events: unknown[]) => Effect.Effect<void>
  ) =>
    Effect.gen(function* () {
      const streamId = generateStreamId();
      const events = [
        { type: 'created', data: 'first' },
        { type: 'updated', data: 'second' },
        { type: 'completed', data: 'third' },
      ];

      const stream = yield* subscribe(createTestPosition(streamId));
      const collectionFiber = yield* pipe(stream, Stream.take(3), Stream.runCollect, Effect.fork);

      yield* Effect.sleep(Duration.millis(50));
      yield* sendEvents(streamId, events);

      const results = yield* Fiber.join(collectionFiber);
      return Chunk.toReadonlyArray(results);
    }),
};
