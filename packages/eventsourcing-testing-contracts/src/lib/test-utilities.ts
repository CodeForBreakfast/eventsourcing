/**
 * Test Utilities for Transport Testing
 *
 * This module provides common test utilities, mock implementations,
 * and test data generators for transport testing scenarios.
 */

import { Effect, Stream, pipe, Chunk, Ref, Duration, Scope } from 'effect';
import { TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';
import type {
  TransportMessage,
  ConnectedTransportTestInterface,
  ConnectionState,
} from './test-layer-interfaces.js';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates unique message IDs for testing
 */
export const generateMessageId = (): string =>
  `msg-${Math.random().toString(36).substring(7)}-${Date.now()}`;

/**
 * Creates a test transport message
 */
export const createTestTransportMessage = <TPayload = unknown>(
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
export const createMockTransport = (): Effect.Effect<
  ConnectedTransportTestInterface,
  never,
  Scope.Scope
> =>
  Effect.gen(function* (_) {
    const stateRef = yield* _(
      Ref.make<MockTransportState>({
        messages: [],
        subscriptions: [],
        isConnected: true,
        connectionStateSubscribers: [],
      })
    );

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
        Effect.gen(function* (_) {
          const state = yield* _(Ref.get(stateRef));
          if (!state.isConnected) {
            return yield* _(
              Effect.fail(
                new TransportError({
                  message: 'Transport is not connected',
                  cause: undefined,
                })
              )
            );
          }

          yield* _(
            Ref.update(stateRef, (s) => ({
              ...s,
              messages: [...s.messages, message],
            }))
          );

          // Notify all subscribers
          state.subscriptions.forEach((subscriber) => subscriber(message));
        }),

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

    // Cleanup on scope close
    yield* _(
      Effect.addFinalizer(() =>
        Effect.sync(() => {
          // Notify disconnection
          const state = Effect.runSync(Ref.get(stateRef));
          state.connectionStateSubscribers.forEach((subscriber) =>
            subscriber('disconnected' as ConnectionState)
          );
        })
      )
    );

    return transport;
  });

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
): Effect.Effect<void, E | 'timeout', never> =>
  Effect.gen(function* (_) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = yield* _(condition());
      if (result) {
        return;
      }
      yield* _(Effect.sleep(Duration.millis(pollIntervalMs)));
    }

    yield* _(Effect.fail('timeout' as const));
  });

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
 * Default implementation of createTestMessage for testing
 * Creates a test message with unique ID
 */
export const createTestMessage = (type: string, payload: unknown): TransportMessage => ({
  id: `test-${Date.now()}-${Math.random()}`,
  type,
  payload,
  metadata: undefined,
});
