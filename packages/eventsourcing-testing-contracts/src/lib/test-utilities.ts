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

/**
 * Creates a mock transport for testing
 */
export const makeMockTransport = (): Effect.Effect<
  ConnectedTransportTestInterface,
  never,
  Scope.Scope
> =>
  pipe(
    Ref.make<MockTransportState>({
      messages: [],
      subscriptions: [],
      isConnected: true,
      connectionStateSubscribers: [],
    }),
    Effect.flatMap((stateRef) => {
      const connectionStateStream = Stream.async<ConnectionState>((emit) => {
        const subscriber = (state: ConnectionState) => {
          emit(Effect.succeed(Chunk.of(state)));
        };

        Effect.runSync(
          Ref.update(stateRef, (state) => ({
            ...state,
            connectionStateSubscribers: [...state.connectionStateSubscribers, subscriber],
          }))
        );

        // Emit initial connected state
        emit(Effect.succeed(Chunk.of('connected' as ConnectionState)));
      });

      const transport: ConnectedTransportTestInterface = {
        connectionState: connectionStateStream,

        publish: (message: TransportMessage) =>
          pipe(
            Ref.get(stateRef),
            Effect.flatMap((state) => {
              if (!state.isConnected) {
                return Effect.fail(
                  new TransportError({
                    message: 'Transport is not connected',
                    cause: undefined,
                  })
                );
              }

              return pipe(
                Ref.update(stateRef, (s) => ({
                  ...s,
                  messages: [...s.messages, message],
                })),
                Effect.tap(() =>
                  Effect.sync(() => {
                    // Notify all subscribers
                    state.subscriptions.forEach((subscriber) => subscriber(message));
                  })
                )
              );
            })
          ),

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
            })
          ),
      };

      return pipe(
        Effect.addFinalizer(() =>
          Effect.sync(() => {
            // Notify disconnection
            const state = Effect.runSync(Ref.get(stateRef));
            state.connectionStateSubscribers.forEach((subscriber) =>
              subscriber('disconnected' as ConnectionState)
            );
          })
        ),
        Effect.map(() => transport)
      );
    })
  );

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Waits for a condition to become true within a timeout period
 */
export const waitForCondition = <E = never>(
  condition: () => Effect.Effect<boolean, E, never>,
  timeoutMs = 5000,
  pollIntervalMs = 100
): Effect.Effect<void, E | 'timeout', never> => {
  const checkCondition = (startTime: number): Effect.Effect<void, E | 'timeout', never> =>
    pipe(
      condition(),
      Effect.flatMap((result) => {
        if (result) {
          return Effect.void;
        }
        if (Date.now() - startTime >= timeoutMs) {
          return Effect.fail('timeout' as const);
        }
        return pipe(
          Effect.sleep(Duration.millis(pollIntervalMs)),
          Effect.flatMap(() => checkCondition(startTime))
        );
      })
    );

  return checkCondition(Date.now());
};

/**
 * Expects an effect to fail with a specific error type
 */
export const expectError = <A, E>(
  effect: Effect.Effect<A, E, never>,
  errorPredicate: (error: E) => boolean
): Effect.Effect<E, Error, never> =>
  pipe(
    effect,
    Effect.flip,
    Effect.filterOrFail(errorPredicate, () => new Error('Error did not match predicate'))
  ) as Effect.Effect<E, Error, never>;

/**
 * Collects all values from a stream within a timeout period
 */
export const collectStreamWithTimeout = <A, E>(
  stream: Stream.Stream<A, E, never>,
  timeoutMs = 5000
): Effect.Effect<Chunk.Chunk<A>, E | 'timeout', never> =>
  pipe(
    stream,
    Stream.runCollect,
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => 'timeout' as const,
    })
  ) as Effect.Effect<Chunk.Chunk<A>, E | 'timeout', never>;

// ============================================================================
// Client-Server Test Helper Implementations
// ============================================================================

/**
 * Default implementation of waitForConnectionState for testing
 * Waits for a specific connection state to be emitted
 */
export const waitForConnectionState = (
  connectionStateStream: Stream.Stream<ConnectionState, never, never>,
  expectedState: ConnectionState,
  timeoutMs: number = 5000
): Effect.Effect<void, Error, never> =>
  pipe(
    connectionStateStream,
    Stream.filter((state) => state === expectedState),
    Stream.take(1),
    Stream.runDrain,
    Effect.timeout(timeoutMs),
    Effect.mapError(() => new Error(`Timeout waiting for connection state: ${expectedState}`))
  );

/**
 * Default implementation of collectMessages for testing
 * Collects a specific number of messages from a stream
 */
export const collectMessages = <T>(
  stream: Stream.Stream<T, never, never>,
  count: number,
  timeoutMs: number = 5000
): Effect.Effect<T[], Error, never> =>
  pipe(
    stream,
    Stream.take(count),
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
    Effect.timeout(timeoutMs),
    Effect.mapError(() => new Error(`Timeout collecting ${count} messages`))
  );

/**
 * Default implementation of makeTestMessage for testing
 * Creates a test message with unique ID
 */
export const makeTestMessage = (type: string, payload: unknown): TransportMessage =>
  makeTransportMessage(
    `test-${Date.now()}-${Math.random()}`,
    type,
    JSON.stringify(payload),
    undefined
  );
