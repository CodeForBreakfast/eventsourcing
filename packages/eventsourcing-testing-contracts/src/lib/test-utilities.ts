/**
 * Test Utilities for Transport Testing
 *
 * This module provides common test utilities, mock implementations,
 * and test data generators for transport testing scenarios.
 */

import { Effect, Stream, pipe, Chunk, Ref, Duration, Scope } from 'effect';
import { TransportError, makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import type {
  TransportMessage,
  ConnectedTransportTestInterface,
  ConnectionState,
} from './test-layer-interfaces';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates unique message IDs for testing
 */
export const generateMessageId = (): string =>
  `msg-${Math.random().toString(36).substring(7)}-${Date.now()}`;

/**
 * Make a test transport message
 */
export const makeTestTransportMessage = <TPayload = unknown>(
  type: string,
  payload: TPayload,
  options?: {
    id?: string;
    metadata?: Record<string, unknown>;
  }
): TransportMessage => ({
  id: options?.id || generateMessageId(),
  type,
  payload,
  metadata: options?.metadata,
});

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Mock transport state for testing
 */
export interface MockTransportState {
  readonly messages: readonly TransportMessage[];
  readonly subscriptions: readonly ((message: TransportMessage) => void)[];
  readonly isConnected: boolean;
  readonly connectionStateSubscribers: readonly ((state: ConnectionState) => void)[];
}

const notifySubscribersOfMessage = (message: TransportMessage, updatedState: MockTransportState) =>
  Effect.sync(() => {
    updatedState.subscriptions.forEach((subscriber) => subscriber(message));
  });

const updateStateWithMessage = (message: TransportMessage) => (s: MockTransportState) => ({
  ...s,
  messages: [...s.messages, message],
});

const updateMessagesAndNotifySubscribers = (
  message: TransportMessage,
  stateRef: Ref.Ref<MockTransportState>
): Effect.Effect<void, never, never> =>
  Effect.flatMap(Ref.update(stateRef, updateStateWithMessage(message)), () =>
    Effect.flatMap(Ref.get(stateRef), (updatedState) =>
      notifySubscribersOfMessage(message, updatedState)
    )
  );

const checkConnectedAndPublish = (
  state: MockTransportState,
  message: TransportMessage,
  stateRef: Ref.Ref<MockTransportState>
): Effect.Effect<void, TransportError, never> => {
  if (!state.isConnected) {
    return Effect.fail(
      new TransportError({
        message: 'Transport is not connected',
        cause: undefined,
      })
    );
  }
  return updateMessagesAndNotifySubscribers(message, stateRef);
};

const publishMessage = (stateRef: Ref.Ref<MockTransportState>, message: TransportMessage) =>
  Effect.flatMap(Ref.get(stateRef), (state) => checkConnectedAndPublish(state, message, stateRef));

const notifyDisconnection = (stateRef: Ref.Ref<MockTransportState>) =>
  Effect.sync(() => {
    const state = Effect.runSync(Ref.get(stateRef));
    state.connectionStateSubscribers.forEach((subscriber) =>
      subscriber('disconnected' as ConnectionState)
    );
  });

const addTransportFinalizer = (
  stateRef: Ref.Ref<MockTransportState>,
  transport: ConnectedTransportTestInterface
): Effect.Effect<ConnectedTransportTestInterface, never, Scope.Scope> =>
  Effect.map(
    Effect.addFinalizer(() => notifyDisconnection(stateRef)),
    () => transport
  );

const addConnectionStateSubscriber =
  (subscriber: (state: ConnectionState) => void) => (state: MockTransportState) => ({
    ...state,
    connectionStateSubscribers: [...state.connectionStateSubscribers, subscriber],
  });

const createTransportFromState = (
  stateRef: Ref.Ref<MockTransportState>
): Effect.Effect<ConnectedTransportTestInterface, never, Scope.Scope> => {
  const connectionStateStream = Stream.async<ConnectionState>((emit) => {
    const subscriber = (state: ConnectionState) => {
      emit(Effect.succeed(Chunk.of(state)));
    };

    Effect.runSync(Ref.update(stateRef, addConnectionStateSubscriber(subscriber)));

    emit(Effect.succeed(Chunk.of('connected' as ConnectionState)));
  });

  const transport: ConnectedTransportTestInterface = {
    connectionState: connectionStateStream,
    publish: (message) => publishMessage(stateRef, message),
    subscribe: (filter) =>
      Effect.succeed(
        Stream.async<TransportMessage>((emit) => {
          const subscriber = (message: TransportMessage) => {
            if (!filter || filter(message)) {
              emit(Effect.succeed(Chunk.of(message)));
            }
          };

          Effect.runSync(
            Ref.update(stateRef, (state) => ({
              ...state,
              subscriptions: [...state.subscriptions, subscriber],
            }))
          );

          return Effect.sync(() => {
            Effect.runSync(
              Ref.update(stateRef, (state) => ({
                ...state,
                subscriptions: state.subscriptions.filter((sub) => sub !== subscriber),
              }))
            );
          });
        })
      ),
  };

  return addTransportFinalizer(stateRef, transport);
};

const makeInitialState = (): Effect.Effect<Ref.Ref<MockTransportState>, never, never> =>
  Ref.make<MockTransportState>({
    messages: [],
    subscriptions: [],
    isConnected: true,
    connectionStateSubscribers: [],
  });

/**
 * Creates a mock transport for testing
 */
export const makeMockTransport = (): Effect.Effect<
  ConnectedTransportTestInterface,
  never,
  Scope.Scope
> => pipe(makeInitialState(), Effect.flatMap(createTransportFromState));

// ============================================================================
// Test Helpers
// ============================================================================

const sleepAndRecheck = <E>(
  startTime: number,
  pollIntervalMs: number,
  checkCondition: (startTime: number) => Effect.Effect<void, E | 'timeout', never>
) => Effect.flatMap(Effect.sleep(Duration.millis(pollIntervalMs)), () => checkCondition(startTime));

const checkConditionOrRetry = <E>(
  result: boolean,
  startTime: number,
  timeoutMs: number,
  pollIntervalMs: number,
  checkCondition: (startTime: number) => Effect.Effect<void, E | 'timeout', never>
): Effect.Effect<void, E | 'timeout', never> => {
  if (result) {
    return Effect.void;
  }
  if (Date.now() - startTime >= timeoutMs) {
    return Effect.fail('timeout' as const);
  }
  return sleepAndRecheck<E>(startTime, pollIntervalMs, checkCondition);
};

const checkConditionWithRetry = <E>(
  startTime: number,
  condition: () => Effect.Effect<boolean, E, never>,
  timeoutMs: number,
  pollIntervalMs: number,
  checkCondition: (startTime: number) => Effect.Effect<void, E | 'timeout', never>
): Effect.Effect<void, E | 'timeout', never> =>
  Effect.flatMap(condition(), (result) =>
    checkConditionOrRetry(result, startTime, timeoutMs, pollIntervalMs, checkCondition)
  );

/**
 * Waits for a condition to become true within a timeout period
 */
export const waitForCondition = <E = never>(
  condition: () => Effect.Effect<boolean, E, never>,
  timeoutMs = 5000,
  pollIntervalMs = 100
): Effect.Effect<void, E | 'timeout', never> => {
  const checkCondition = (startTime: number): Effect.Effect<void, E | 'timeout', never> =>
    checkConditionWithRetry(startTime, condition, timeoutMs, pollIntervalMs, checkCondition);

  return checkCondition(Date.now());
};

const flipAndFilterError = <A, E>(
  errorPredicate: (error: E) => boolean,
  effect: Effect.Effect<A, E, never>
): Effect.Effect<E, Error, never> =>
  Effect.filterOrFail(
    Effect.flip(effect),
    errorPredicate,
    () => new Error('Error did not match predicate')
  ) as Effect.Effect<E, Error, never>;

/**
 * Expects an effect to fail with a specific error type
 */
export const expectError = <A, E>(
  effect: Effect.Effect<A, E, never>,
  errorPredicate: (error: E) => boolean
): Effect.Effect<E, Error, never> => flipAndFilterError<A, E>(errorPredicate, effect);

const collectWithTimeout = <A, E>(
  timeoutMs: number,
  stream: Stream.Stream<A, E, never>
): Effect.Effect<Chunk.Chunk<A>, E | 'timeout', never> =>
  Effect.timeoutFail(Stream.runCollect(stream), {
    duration: Duration.millis(timeoutMs),
    onTimeout: () => 'timeout' as const,
  }) as Effect.Effect<Chunk.Chunk<A>, E | 'timeout', never>;

/**
 * Collects all values from a stream within a timeout period
 */
export const collectStreamWithTimeout = <A, E>(
  stream: Stream.Stream<A, E, never>,
  timeoutMs = 5000
): Effect.Effect<Chunk.Chunk<A>, E | 'timeout', never> =>
  collectWithTimeout<A, E>(timeoutMs, stream);

// ============================================================================
// Client-Server Test Helper Implementations
// ============================================================================

const filterTakeAndDrain = (
  expectedState: ConnectionState,
  timeoutMs: number,
  connectionStateStream: Stream.Stream<ConnectionState, never, never>
): Effect.Effect<void, Error, never> =>
  Effect.mapError(
    Effect.timeout(
      Stream.runDrain(
        Stream.take(
          Stream.filter(connectionStateStream, (state) => state === expectedState),
          1
        )
      ),
      timeoutMs
    ),
    () => new Error(`Timeout waiting for connection state: ${expectedState}`)
  );

/**
 * Default implementation of waitForConnectionState for testing
 * Waits for a specific connection state to be emitted
 */
export const waitForConnectionState = (
  connectionStateStream: Stream.Stream<ConnectionState, never, never>,
  expectedState: ConnectionState,
  timeoutMs: number = 5000
): Effect.Effect<void, Error, never> =>
  filterTakeAndDrain(expectedState, timeoutMs, connectionStateStream);

const takeCollectAndTimeout = <T>(
  count: number,
  timeoutMs: number,
  stream: Stream.Stream<T, never, never>
): Effect.Effect<T[], Error, never> =>
  Effect.mapError(
    Effect.timeout(
      Effect.map(Stream.runCollect(Stream.take(stream, count)), (chunk) => Array.from(chunk)),
      timeoutMs
    ),
    () => new Error(`Timeout collecting ${count} messages`)
  );

/**
 * Default implementation of collectMessages for testing
 * Collects a specific number of messages from a stream
 */
export const collectMessages = <T>(
  stream: Stream.Stream<T, never, never>,
  count: number,
  timeoutMs: number = 5000
): Effect.Effect<T[], Error, never> => takeCollectAndTimeout<T>(count, timeoutMs, stream);

/**
 * Default implementation of makeTestMessage for testing
 * Creates a test message with unique ID
 */
export const makeTestMessage = (type: string, payload: unknown): TransportMessage =>
  makeTransportMessage(
    `test-${Date.now()}-${Math.random()}`,
    type,
    typeof payload === 'string' ? payload : JSON.stringify(payload),
    undefined
  );
