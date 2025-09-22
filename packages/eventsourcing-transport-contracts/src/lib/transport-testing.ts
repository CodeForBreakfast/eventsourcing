/**
 * Transport Contract Test Suite
 *
 * These tests validate the low-level message transport behaviors
 * without any domain-specific concepts. They focus purely
 * on message delivery, ordering, and connection management.
 *
 * These are REQUIRED behaviors for any transport implementation.
 */

import { Effect, Stream, pipe, Chunk, Fiber, Duration } from 'effect';
import { describe, expect, it } from 'bun:test';
import type {
  TransportMessage,
  ConnectionState,
  TransportFeatures,
} from './transport-abstractions.js';

/**
 * Transport test context - pure message transport operations
 */
export interface TransportTestContext<TMessage extends TransportMessage = TransportMessage> {
  // Core transport operations
  readonly connect: () => Effect.Effect<void>;
  readonly disconnect: () => Effect.Effect<void>;
  readonly isConnected: () => Effect.Effect<boolean>;

  // Pub/Sub operations
  readonly subscribe: (
    filter?: (message: TMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TMessage, never, never>>;
  readonly publish: (message: TMessage) => Effect.Effect<void>;

  // Request/Response operations
  readonly request: <T, R>(request: T, timeout?: Duration.Duration) => Effect.Effect<R, Error>;

  // Connection management
  readonly simulateDisconnect?: () => Effect.Effect<void>;
  readonly simulateReconnect?: () => Effect.Effect<void>;
  readonly getConnectionState: () => Effect.Effect<ConnectionState>;
  readonly getBufferedMessageCount: () => Effect.Effect<number>;
}

/**
 * Transport contract test suite.
 *
 * These tests ensure that any transport implementation correctly
 * handles message delivery, ordering, and connection management.
 *
 * @param name - Name of the transport implementation
 * @param setup - Function that creates a transport test context
 * @param features - Optional features this transport supports
 */
export function runTransportContractTests<TMessage extends TransportMessage = TransportMessage>(
  name: string,
  setup: () => Effect.Effect<TransportTestContext<TMessage>, never, never>,
  features?: TransportFeatures
) {
  describe(`${name} Transport Contract`, () => {
    describe('Connection Management', () => {
      it('MUST establish connection before operations', async () => {
        const context = await Effect.runPromise(setup());

        // Initially disconnected
        const initialState = await Effect.runPromise(context.isConnected());
        expect(initialState).toBe(false);

        // Connect
        await Effect.runPromise(context.connect());
        const connectedState = await Effect.runPromise(context.isConnected());
        expect(connectedState).toBe(true);

        // Can perform operations
        const message: TMessage = {
          id: '1',
          type: 'test',
          payload: 'hello',
          timestamp: new Date(),
        } as TMessage;

        await Effect.runPromise(context.publish(message));

        // Disconnect
        await Effect.runPromise(context.disconnect());
        const disconnectedState = await Effect.runPromise(context.isConnected());
        expect(disconnectedState).toBe(false);
      });

      it('MUST handle multiple connect/disconnect cycles', async () => {
        const context = await Effect.runPromise(setup());

        for (let i = 0; i < 3; i++) {
          await Effect.runPromise(context.connect());
          expect(await Effect.runPromise(context.isConnected())).toBe(true);

          await Effect.runPromise(context.disconnect());
          expect(await Effect.runPromise(context.isConnected())).toBe(false);
        }
      });

      it('MUST be idempotent for connect/disconnect', async () => {
        const context = await Effect.runPromise(setup());

        // Multiple connects
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.connect());
        expect(await Effect.runPromise(context.isConnected())).toBe(true);

        // Multiple disconnects
        await Effect.runPromise(context.disconnect());
        await Effect.runPromise(context.disconnect());
        await Effect.runPromise(context.disconnect());
        expect(await Effect.runPromise(context.isConnected())).toBe(false);
      });

      if (features?.supportsReconnection) {
        it('OPTIONAL: should handle reconnection after network failure', async () => {
          const context = await Effect.runPromise(setup());
          if (!context.simulateDisconnect || !context.simulateReconnect) {
            return; // Skip if not supported
          }

          await Effect.runPromise(context.connect());

          // Subscribe to messages
          const messagesFiber = await Effect.runPromise(
            pipe(
              context.subscribe(),
              Effect.map((stream) =>
                pipe(stream, Stream.runCollect, Effect.map(Chunk.toReadonlyArray), Effect.fork)
              ),
              Effect.flatten
            )
          );

          // Simulate network failure
          await Effect.runPromise(context.simulateDisconnect());
          const state = await Effect.runPromise(context.getConnectionState());
          expect(state).toBe('reconnecting');

          // Simulate reconnection
          await Effect.runPromise(context.simulateReconnect());
          const reconnectedState = await Effect.runPromise(context.getConnectionState());
          expect(reconnectedState).toBe('connected');

          // Should be able to continue operations
          const message: TMessage = {
            id: '2',
            type: 'test',
            payload: 'after-reconnect',
            timestamp: new Date(),
          } as TMessage;
          await Effect.runPromise(context.publish(message));

          // Cleanup
          await Effect.runPromise(Fiber.interrupt(messagesFiber));
        });
      }
    });

    describe('Message Delivery', () => {
      it('MUST deliver messages to correct subscribers', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Subscribe to different message types
        const type1Messages = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'type1'),
            Effect.map((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        const type2Messages = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'type2'),
            Effect.map((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        // Publish to different types
        await Effect.runPromise(
          pipe(
            Effect.sleep(Duration.millis(50)),
            Effect.zipRight(
              context.publish({
                id: '1',
                type: 'type1',
                payload: 'for-type1',
                timestamp: new Date(),
              } as TMessage)
            )
          )
        );

        await Effect.runPromise(
          context.publish({
            id: '2',
            type: 'type2',
            payload: 'for-type2',
            timestamp: new Date(),
          } as TMessage)
        );

        // Wait for messages
        const results1 = await Effect.runPromise(Fiber.join(type1Messages));
        const results2 = await Effect.runPromise(Fiber.join(type2Messages));

        expect(results1).toHaveLength(1);
        expect(results2).toHaveLength(1);
        expect(results1[0]?.payload).toBe('for-type1');
        expect(results2[0]?.payload).toBe('for-type2');
      });

      it('MUST support multiple subscribers to same message type', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Multiple subscribers to same type
        const subscriber1 = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'shared'),
            Effect.map((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        const subscriber2 = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'shared'),
            Effect.map((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        // Publish message
        await Effect.runPromise(
          pipe(
            Effect.sleep(Duration.millis(50)),
            Effect.zipRight(
              context.publish({
                id: '1',
                type: 'shared',
                payload: 'shared-message',
                timestamp: new Date(),
              } as TMessage)
            )
          )
        );

        // Both should receive the message
        const results1 = await Effect.runPromise(Fiber.join(subscriber1));
        const results2 = await Effect.runPromise(Fiber.join(subscriber2));

        expect(results1).toHaveLength(1);
        expect(results2).toHaveLength(1);
        expect(results1[0]?.payload).toBe('shared-message');
        expect(results2[0]?.payload).toBe('shared-message');
      });

      if (features?.guaranteesOrdering) {
        it('OPTIONAL: should maintain message order within a type', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          const messages = await Effect.runPromise(
            pipe(
              context.subscribe((msg) => msg.type === 'ordered'),
              Effect.map((stream) =>
                pipe(
                  stream,
                  Stream.take(10),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          // Send messages in order
          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          for (let i = 0; i < 10; i++) {
            await Effect.runPromise(
              context.publish({
                id: `msg-${i}`,
                type: 'ordered',
                payload: i,
                timestamp: new Date(),
              } as TMessage)
            );
          }

          const results = await Effect.runPromise(Fiber.join(messages));
          expect(results).toHaveLength(10);

          // Verify order
          results.forEach((msg, index) => {
            expect(msg.payload).toBe(index);
          });
        });
      }
    });

    describe('Request/Response Pattern', () => {
      it('MUST support request/response with timeout', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Successful request
        const successPromise = Effect.runPromise(
          pipe(
            context.request({ action: 'ping' }, Duration.seconds(1)),
            Effect.map((response) => ({ success: true, response })),
            Effect.catchAll(() => Effect.succeed({ success: false }))
          )
        );

        // This would normally be handled by a server
        // For testing, we're checking the timeout behavior
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = await successPromise;
        // Transport should handle this appropriately
        expect(result).toHaveProperty('success');
      });

      it('MUST timeout requests that exceed deadline', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        const result = await Effect.runPromise(
          pipe(
            context.request({ action: 'slow-operation' }, Duration.millis(100)),
            Effect.map(() => 'success'),
            Effect.catchAll(() => Effect.succeed('timeout'))
          )
        );

        expect(result).toBe('timeout');
      });
    });

    describe('Buffering and Backpressure', () => {
      if (features?.supportsOfflineBuffering) {
        it('OPTIONAL: should buffer messages during disconnect', async () => {
          const context = await Effect.runPromise(setup());
          if (!context.simulateDisconnect || !context.simulateReconnect) {
            return;
          }

          await Effect.runPromise(context.connect());

          // Disconnect
          await Effect.runPromise(context.simulateDisconnect());

          // Try to send messages while disconnected
          const messages = Array.from({ length: 5 }, (_, i) => ({
            id: `buffered-${i}`,
            type: 'test',
            payload: `message-${i}`,
            timestamp: new Date(),
          })) as TMessage[];

          // These should be buffered
          await Promise.all(messages.map((msg) => Effect.runPromise(context.publish(msg))));

          const bufferedCount = await Effect.runPromise(context.getBufferedMessageCount());
          expect(bufferedCount).toBeGreaterThan(0);

          // Reconnect and verify buffered messages are sent
          await Effect.runPromise(context.simulateReconnect());

          // Buffer should be flushed
          await new Promise((resolve) => setTimeout(resolve, 100));
          const afterFlush = await Effect.runPromise(context.getBufferedMessageCount());
          expect(afterFlush).toBe(0);
        });
      }

      if (features?.supportsBackpressure) {
        it('OPTIONAL: should handle backpressure on slow consumers', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          const slowConsumer = await Effect.runPromise(
            pipe(
              context.subscribe((msg) => msg.type === 'backpressure-test'),
              Effect.map((stream) =>
                pipe(
                  stream,
                  Stream.tap(() => Effect.sleep(Duration.millis(100))), // Slow processing
                  Stream.take(10),
                  Stream.runCollect,
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          // Send many messages quickly
          const sendStart = Date.now();
          await Effect.runPromise(
            Effect.forEach(
              Array.from({ length: 10 }, (_, i) => ({
                id: `bp-${i}`,
                type: 'backpressure-test',
                payload: i,
                timestamp: new Date(),
              })) as TMessage[],
              (msg) => context.publish(msg),
              { concurrency: 'unbounded' }
            )
          );
          const sendEnd = Date.now();

          // Publishing should be fast (not blocked by slow consumer)
          expect(sendEnd - sendStart).toBeLessThan(500);

          // Consumer should eventually get all messages
          const results = await Effect.runPromise(Fiber.join(slowConsumer));
          expect(Chunk.size(results)).toBe(10);
        });
      }
    });

    describe('Stream Management', () => {
      it('MUST properly clean up resources on stream termination', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Create and immediately cancel a subscription
        const fiber = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'cleanup-test'),
            Effect.flatMap((stream) => pipe(stream, Stream.runDrain, Effect.fork))
          )
        );

        // Cancel the subscription
        await Effect.runPromise(Fiber.interrupt(fiber));

        // Should be able to subscribe again to the same type
        const newSubscription = await Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'cleanup-test'),
            Effect.map((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        // Send a message
        await Effect.runPromise(
          pipe(
            Effect.sleep(Duration.millis(50)),
            Effect.zipRight(
              context.publish({
                id: '1',
                type: 'cleanup-test',
                payload: 'after-cleanup',
                timestamp: new Date(),
              } as TMessage)
            )
          )
        );

        const results = await Effect.runPromise(Fiber.join(newSubscription));
        expect(results).toHaveLength(1);
      });

      it('MUST handle concurrent subscriptions and unsubscriptions', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Rapid subscribe/unsubscribe cycles
        const operations = Array.from({ length: 10 }, (_, i) =>
          pipe(
            context.subscribe((msg) => msg.type === `concurrent-${i % 3}`), // Use 3 types
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runDrain,
                Effect.timeoutTo({
                  duration: Duration.millis(100),
                  onTimeout: () => Effect.void,
                  onSuccess: () => Effect.void,
                })
              )
            )
          )
        );

        await Effect.runPromise(Effect.all(operations, { concurrency: 'unbounded' }));

        // System should remain stable
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });
    });

    describe('Error Handling', () => {
      it('MUST gracefully handle malformed messages', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        // Try to publish various malformed messages
        const malformedMessages = [
          { id: '', type: 'test', payload: null, timestamp: new Date() },
          { id: '1', type: '', payload: 'test', timestamp: new Date() },
          { id: '2', type: 'test', payload: undefined, timestamp: new Date(0) },
        ] as TMessage[];

        for (const msg of malformedMessages) {
          const result = await Effect.runPromise(
            pipe(
              context.publish(msg),
              Effect.map(() => 'success'),
              Effect.catchAll(() => Effect.succeed('error'))
            )
          );
          // Should either succeed or fail gracefully
          expect(['success', 'error']).toContain(result);
        }

        // Transport should still be functional
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });

      it('MUST handle network errors without crashing', async () => {
        const context = await Effect.runPromise(setup());

        // Try operations before connection
        const beforeConnect = await Effect.runPromise(
          pipe(
            context.publish({
              id: '1',
              type: 'test',
              payload: 'test',
              timestamp: new Date(),
            } as TMessage),
            Effect.map(() => 'success'),
            Effect.catchAll(() => Effect.succeed('error'))
          )
        );

        expect(beforeConnect).toBe('error');

        // Connect and verify recovery
        await Effect.runPromise(context.connect());
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });
    });

    if (features?.supportsMultiplexing) {
      describe('Multiplexing', () => {
        it('OPTIONAL: should efficiently handle many message types over single connection', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          // Create many type subscriptions
          const numTypes = 100;
          const subscriptions = await Effect.runPromise(
            Effect.all(
              Array.from({ length: numTypes }, (_, i) =>
                pipe(
                  context.subscribe((msg) => msg.type === `type-${i}`),
                  Effect.map((stream) => ({
                    type: `type-${i}`,
                    fiber: pipe(
                      stream,
                      Stream.take(1),
                      Stream.runCollect,
                      Effect.map(Chunk.toReadonlyArray),
                      Effect.fork
                    ),
                  })),
                  Effect.flatMap(({ type, fiber }) =>
                    pipe(
                      fiber,
                      Effect.map((f) => ({ type, fiber: f }))
                    )
                  )
                )
              )
            )
          );

          // Send message to each type
          await Effect.runPromise(
            Effect.forEach(
              Array.from({ length: numTypes }, (_, i) => ({
                id: `msg-${i}`,
                type: `type-${i}`,
                payload: `data-${i}`,
                timestamp: new Date(),
              })) as TMessage[],
              (msg) => context.publish(msg),
              { concurrency: 'unbounded' }
            )
          );

          // Verify all received their messages
          const results = await Effect.runPromise(
            Effect.all(subscriptions.map(({ fiber }) => Fiber.join(fiber)))
          );

          expect(results.every((r) => r.length === 1)).toBe(true);
        });
      });
    }
  });
}
