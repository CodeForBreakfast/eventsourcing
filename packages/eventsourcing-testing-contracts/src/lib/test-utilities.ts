/**
 * Test Utilities for Event Sourcing Testing
 *
 * This module provides common test utilities, mock implementations,
 * and test data generators for event sourcing testing scenarios.
 */

import { Effect, Stream, Layer, Data, pipe, Chunk, Ref, Duration, Fiber, Scope } from 'effect';
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
import type {
  TransportMessage,
  ConnectionState,
  TransportTestContext,
  ConnectedTransportTestInterface,
} from './test-layer-interfaces.js';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates unique stream IDs for testing
 */
export const generateStreamId = (prefix = 'test-stream'): EventStreamId =>
  `${prefix}-${Math.random().toString(36).substring(7)}-${Date.now()}` as EventStreamId;

/**
 * Generates unique command IDs for testing
 */
export const generateCommandId = (): string =>
  `cmd-${Math.random().toString(36).substring(7)}-${Date.now()}`;

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
 * Creates a test transport message (aligned with simplified interface)
 */
export const createTestTransportMessage = <TPayload = unknown>(
  payload: TPayload,
  options?: {
    id?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }
): TransportMessage => ({
  id: options?.id || generateMessageId(),
  type: options?.type || 'test-message',
  payload,
  ...(options?.metadata && { metadata: options.metadata }),
  // Note: timestamp removed from simplified interface
});

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
    readonly filter?: (message: TransportMessage) => boolean;
  }>;
  readonly bufferedMessages: ReadonlyArray<TransportMessage>;
  readonly metrics: {
    readonly messagesSent: number;
    readonly messagesReceived: number;
    readonly connectionDrops: number;
  };
}

/**
 * Creates a mock transport implementation for testing the simplified interface
 */
export const createMockTransport = (): Effect.Effect<TransportTestContext, never, never> =>
  Effect.gen(function* () {
    const globalState = yield* Ref.make<MockTransportState>({
      isConnected: false,
      connectionState: 'disconnected',
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
    ): Effect.Effect<ConnectedTransportTestInterface, Error, Scope.Scope> =>
      Effect.gen(function* () {
        // Validate URL (basic check)
        if (url.startsWith('invalid://')) {
          yield* Effect.fail(new Error(`Invalid URL: ${url}`));
        }

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
            filter?: (msg: TransportMessage) => boolean;
            queue: Ref.Ref<TransportMessage[]>;
          }>
        >([]);

        const publish = (message: TransportMessage): Effect.Effect<void, Error, never> =>
          Effect.gen(function* () {
            const currentState = yield* Ref.get(globalState);

            if (!currentState.isConnected) {
              yield* Effect.fail(new Error('Transport not connected'));
            }

            // Add to main message queue
            yield* Ref.update(messageQueue, (messages) => [...messages, message]);

            // Distribute to all active subscriptions
            const subs = yield* Ref.get(subscriptionStreams);
            for (const sub of subs) {
              if (!sub.filter || sub.filter(message)) {
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
        ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never> =>
          Effect.gen(function* () {
            const subscriptionId = generateMessageId();
            const subscriptionQueue = yield* Ref.make<TransportMessage[]>([]);

            const subscription = {
              id: subscriptionId,
              filter,
              queue: subscriptionQueue,
            };

            yield* Ref.update(subscriptionStreams, (subs) => [...subs, subscription]);

            // Set up cleanup when subscription ends
            yield* Effect.addFinalizer(() =>
              Ref.update(subscriptionStreams, (subs) =>
                subs.filter((sub) => sub.id !== subscriptionId)
              )
            );

            // Create stream from subscription queue
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
              Stream.filter((msg) => !filter || filter(msg))
            );

            return stream;
          });

        return {
          connectionState,
          publish,
          subscribe,
        };
      });

    const simulateDisconnect = (): Effect.Effect<void> =>
      Ref.update(globalState, (s) => ({
        ...s,
        isConnected: false,
        connectionState: 'error' as ConnectionState,
        metrics: {
          ...s.metrics,
          connectionDrops: s.metrics.connectionDrops + 1,
        },
      }));

    const simulateReconnect = (): Effect.Effect<void> =>
      Ref.update(globalState, (s) => ({
        ...s,
        isConnected: true,
        connectionState: 'connected' as ConnectionState,
        messages: [...s.messages, ...s.bufferedMessages],
        bufferedMessages: [],
      }));

    const getBufferedMessageCount = (): Effect.Effect<number> =>
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
    readonly processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>;
    readonly getEventCount: (streamId: EventStreamId) => Effect.Effect<number>;
    readonly getLastEventNumber: (streamId: EventStreamId) => Effect.Effect<EventNumber>;
    readonly reset: () => Effect.Effect<void>;
  },
  never,
  never
> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<MockDomainState>({
      streams: new Map(),
      processedCommands: [],
    });

    const processCommand = (command: AggregateCommand): Effect.Effect<CommandResult> =>
      Effect.gen(function* () {
        const currentState = yield* Ref.get(state);
        const { streamId, eventNumber: expectedVersion } = command.aggregate.position;

        const stream = currentState.streams.get(streamId);
        const currentVersion = stream?.lastEventNumber || (0 as EventNumber);

        // Simulate optimistic concurrency control
        if (expectedVersion !== currentVersion) {
          return {
            _tag: 'Left',
            left: createMockCommandError(
              `Optimistic concurrency violation. Expected version ${expectedVersion}, got ${currentVersion}`
            ),
          } as any;
        }

        // Simulate business rule validation
        if (command.payload && typeof command.payload === 'object' && 'amount' in command.payload) {
          const amount = (command.payload as any).amount;
          if (amount < 0) {
            return {
              _tag: 'Left',
              left: createMockCommandError('Negative amounts not allowed'),
            } as any;
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

        return {
          _tag: 'Right',
          right: {
            streamId,
            eventNumber: newEventNumber,
          },
        } as any;
      });

    const getEventCount = (streamId: EventStreamId): Effect.Effect<number> =>
      pipe(
        Ref.get(state),
        Effect.map((s) => s.streams.get(streamId)?.events.length || 0)
      );

    const getLastEventNumber = (streamId: EventStreamId): Effect.Effect<EventNumber> =>
      pipe(
        Ref.get(state),
        Effect.map((s) => s.streams.get(streamId)?.lastEventNumber || (0 as EventNumber))
      );

    const reset = (): Effect.Effect<void> =>
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
export const expectError = <E>(
  effect: Effect.Effect<unknown, E>,
  predicate: (error: E) => boolean
): Effect.Effect<void> =>
  pipe(
    effect,
    Effect.flip,
    Effect.tap((error) =>
      predicate(error)
        ? Effect.void
        : Effect.fail(new Error(`Error does not match predicate: ${error}`))
    ),
    Effect.asVoid
  );

/**
 * Collects all values from a stream with timeout
 */
export const collectStreamWithTimeout = <T>(
  stream: Stream.Stream<T, never, never>,
  count: number,
  timeoutMs = 5000
): Effect.Effect<ReadonlyArray<T>, Error> =>
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
      processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>;
      getEventCount: (streamId: EventStreamId) => Effect.Effect<number>;
      getLastEventNumber: (streamId: EventStreamId) => Effect.Effect<EventNumber>;
      reset: () => Effect.Effect<void>;
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
  basicCommandFlow: (processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>) =>
    Effect.gen(function* () {
      const command = createTestCommand({ action: 'test', value: 42 });
      const result = yield* processCommand(command);
      return result;
    }),

  /**
   * Tests optimistic concurrency control
   */
  optimisticConcurrency: (
    processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>
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
