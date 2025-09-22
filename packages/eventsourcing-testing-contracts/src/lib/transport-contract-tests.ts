/**
 * LAYER 1: Transport Contract Tests
 *
 * Tests ONLY pure message delivery mechanics. NO event sourcing concepts.
 * These tests validate that a transport can reliably deliver messages between endpoints.
 *
 * WHAT IS TESTED:
 * - Message delivery (publish/subscribe)
 * - Connection management (connect/disconnect)
 * - Error handling (network failures, malformed messages)
 * - Optional features (reconnection, buffering, ordering)
 *
 * WHAT IS NOT TESTED:
 * - Event sourcing semantics
 * - Command/event concepts
 * - Business logic
 * - Domain invariants
 */

import { Effect, Stream, pipe, Chunk, Duration, Fiber } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type {
  TransportMessage,
  TransportTestContext,
  TransportFeatures,
  TransportTestRunner,
} from './test-layer-interfaces.js';

/**
 * REQUIRED: Core transport contract tests.
 * Every transport implementation MUST pass these tests.
 */
export const runTransportContractTests: TransportTestRunner = (
  name: string,
  setup: () => Effect.Effect<TransportTestContext>,
  features?: TransportFeatures
) => {
  describe(`${name} Transport Contract`, () => {
    let context: TransportTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      if (await Effect.runPromise(context.isConnected())) {
        await Effect.runPromise(context.disconnect());
      }
    });

    describe('REQUIRED: Connection Management', () => {
      it('should start disconnected', async () => {
        const connected = await Effect.runPromise(context.isConnected());
        expect(connected).toBe(false);
      });

      it('should connect successfully', async () => {
        await Effect.runPromise(context.connect());
        const connected = await Effect.runPromise(context.isConnected());
        expect(connected).toBe(true);
      });

      it('should disconnect successfully', async () => {
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.disconnect());
        const connected = await Effect.runPromise(context.isConnected());
        expect(connected).toBe(false);
      });

      it('should handle multiple connect calls gracefully', async () => {
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.connect());

        const connected = await Effect.runPromise(context.isConnected());
        expect(connected).toBe(true);
      });

      it('should handle multiple disconnect calls gracefully', async () => {
        await Effect.runPromise(context.connect());
        await Effect.runPromise(context.disconnect());
        await Effect.runPromise(context.disconnect());
        await Effect.runPromise(context.disconnect());

        const connected = await Effect.runPromise(context.isConnected());
        expect(connected).toBe(false);
      });

      it('should report correct connection state', async () => {
        let state = await Effect.runPromise(context.getConnectionState());
        expect(state).toBe('disconnected');

        await Effect.runPromise(context.connect());
        state = await Effect.runPromise(context.getConnectionState());
        expect(state).toBe('connected');

        await Effect.runPromise(context.disconnect());
        state = await Effect.runPromise(context.getConnectionState());
        expect(state).toBe('disconnected');
      });
    });

    describe('REQUIRED: Message Publishing', () => {
      beforeEach(async () => {
        await Effect.runPromise(context.connect());
      });

      it('should publish a simple message', async () => {
        const message: TransportMessage = {
          id: 'test-1',
          type: 'test-message',
          payload: { content: 'hello world' },
        };

        // Should not throw
        await Effect.runPromise(context.publish(message));
      });

      it('should handle messages with various payload types', async () => {
        const messages: TransportMessage[] = [
          {
            id: 'string-msg',
            type: 'test',
            payload: 'simple string',
          },
          {
            id: 'number-msg',
            type: 'test',
            payload: 42,
          },
          {
            id: 'boolean-msg',
            type: 'test',
            payload: true,
          },
          {
            id: 'object-msg',
            type: 'test',
            payload: { nested: { data: [1, 2, 3] } },
          },
          {
            id: 'array-msg',
            type: 'test',
            payload: [{ a: 1 }, { b: 2 }],
          },
          {
            id: 'null-msg',
            type: 'test',
            payload: null,
          },
        ];

        for (const msg of messages) {
          await Effect.runPromise(context.publish(msg));
        }
      });

      it('should handle messages with metadata', async () => {
        const message: TransportMessage = {
          id: 'meta-msg',
          type: 'test-message',
          payload: { content: 'test' },
          metadata: {
            source: 'test-suite',
            priority: 'high',
            customField: { nested: 'value' },
          },
        };

        await Effect.runPromise(context.publish(message));
      });

      it('should reject publishing when disconnected', async () => {
        await Effect.runPromise(context.disconnect());

        const message: TransportMessage = {
          id: 'disconnected-msg',
          type: 'test',
          payload: 'should fail',
        };

        const result = await Effect.runPromise(
          pipe(
            context.publish(message),
            Effect.map(() => 'success' as const),
            Effect.catchAll(() => Effect.succeed('error' as const))
          )
        );

        expect(result).toBe('error');
      });
    });

    describe('REQUIRED: Message Subscription', () => {
      beforeEach(async () => {
        await Effect.runPromise(context.connect());
      });

      it('should receive published messages', async () => {
        const messagePromise = Effect.runPromise(
          pipe(
            context.subscribe(),
            Effect.flatMap((stream) =>
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

        // Give subscription time to set up
        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        const testMessage: TransportMessage = {
          id: 'sub-test-1',
          type: 'subscription-test',
          payload: { data: 'received' },
        };

        await Effect.runPromise(context.publish(testMessage));

        const messages = await messagePromise;
        expect(messages).toHaveLength(1);
        expect(messages[0]?.id).toBe('sub-test-1');
        expect(messages[0]?.type).toBe('subscription-test');
      });

      it('should support multiple concurrent subscriptions', async () => {
        const subscription1 = Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'type-a'),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(2),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        const subscription2 = Effect.runPromise(
          pipe(
            context.subscribe((msg) => msg.type === 'type-b'),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(2),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        // Send mixed messages
        const messages = [
          { id: '1', type: 'type-a', payload: 'a1' },
          { id: '2', type: 'type-b', payload: 'b1' },
          { id: '3', type: 'type-a', payload: 'a2' },
          { id: '4', type: 'type-b', payload: 'b2' },
        ];

        for (const msg of messages) {
          await Effect.runPromise(context.publish(msg));
        }

        const [typeAMessages, typeBMessages] = await Promise.all([subscription1, subscription2]);

        expect(typeAMessages).toHaveLength(2);
        expect(typeBMessages).toHaveLength(2);
        expect(typeAMessages.every((msg) => msg.type === 'type-a')).toBe(true);
        expect(typeBMessages.every((msg) => msg.type === 'type-b')).toBe(true);
      });

      it('should handle subscription filters correctly', async () => {
        const complexFilter = (msg: TransportMessage) => {
          const payload = msg.payload as any;
          return (
            msg.type === 'filtered-test' &&
            payload?.priority === 'high' &&
            typeof payload?.value === 'number' &&
            payload.value > 10
          );
        };

        const filteredMessages = Effect.runPromise(
          pipe(
            context.subscribe(complexFilter),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(2),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten
          )
        );

        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        const testMessages = [
          {
            id: '1',
            type: 'filtered-test',
            payload: { priority: 'high', value: 15 },
          }, // Should match
          {
            id: '2',
            type: 'filtered-test',
            payload: { priority: 'low', value: 20 },
          }, // Should not match (priority)
          {
            id: '3',
            type: 'filtered-test',
            payload: { priority: 'high', value: 5 },
          }, // Should not match (value)
          {
            id: '4',
            type: 'other-test',
            payload: { priority: 'high', value: 25 },
          }, // Should not match (type)
          {
            id: '5',
            type: 'filtered-test',
            payload: { priority: 'high', value: 30 },
          }, // Should match
        ];

        for (const msg of testMessages) {
          await Effect.runPromise(context.publish(msg));
        }

        const results = await filteredMessages;
        expect(results).toHaveLength(2);
        expect(results[0]?.id).toBe('1');
        expect(results[1]?.id).toBe('5');
      });

      it('should handle subscription to no messages gracefully', async () => {
        const noMatchFilter = (msg: TransportMessage) => msg.type === 'never-exists';

        const noMessages = Effect.runPromise(
          pipe(
            context.subscribe(noMatchFilter),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.either,
                Effect.fork
              )
            ),
            Effect.flatten,
            Effect.timeout(Duration.millis(200))
          )
        );

        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        // Send some messages that won't match
        await Effect.runPromise(
          context.publish({
            id: 'no-match',
            type: 'different-type',
            payload: 'test',
          })
        );

        const result = await noMessages;
        // Should timeout with no messages
        expect(result._tag).toBe('Left');
      });
    });

    // OPTIONAL FEATURE TESTS

    if (features?.guaranteesMessageOrdering) {
      describe('OPTIONAL: Message Ordering', () => {
        beforeEach(async () => {
          await Effect.runPromise(context.connect());
        });

        it('should maintain message order', async () => {
          const orderedMessages = Effect.runPromise(
            pipe(
              context.subscribe((msg) => msg.type === 'order-test'),
              Effect.flatMap((stream) =>
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

          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          // Send messages in sequence
          for (let i = 0; i < 10; i++) {
            await Effect.runPromise(
              context.publish({
                id: `order-${i}`,
                type: 'order-test',
                payload: { sequence: i },
              })
            );
          }

          const messages = await orderedMessages;
          expect(messages).toHaveLength(10);

          // Verify ordering
          messages.forEach((msg, index) => {
            expect((msg.payload as any).sequence).toBe(index);
          });
        });
      });
    }

    if (features?.supportsOfflineBuffering && context.getBufferedMessageCount) {
      describe('OPTIONAL: Offline Buffering', () => {
        it('should buffer messages when disconnected', async () => {
          // Start disconnected
          const message: TransportMessage = {
            id: 'buffered-1',
            type: 'buffer-test',
            payload: 'buffered message',
          };

          // This should buffer the message rather than fail
          await Effect.runPromise(context.publish(message));

          const bufferedCount = await Effect.runPromise(context.getBufferedMessageCount());
          expect(bufferedCount).toBeGreaterThan(0);
        });

        it('should deliver buffered messages on reconnect', async () => {
          // Buffer a message while disconnected
          const bufferedMessage: TransportMessage = {
            id: 'buffered-delivery',
            type: 'delivery-test',
            payload: 'will be delivered later',
          };

          await Effect.runPromise(context.publish(bufferedMessage));

          // Now connect and set up subscription
          await Effect.runPromise(context.connect());

          const deliveredMessages = Effect.runPromise(
            pipe(
              context.subscribe((msg) => msg.type === 'delivery-test'),
              Effect.flatMap((stream) =>
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

          const messages = await deliveredMessages;
          expect(messages).toHaveLength(1);
          expect(messages[0]?.id).toBe('buffered-delivery');
        });
      });
    }

    if (features?.supportsReconnection && context.simulateDisconnect && context.simulateReconnect) {
      describe('OPTIONAL: Reconnection Handling', () => {
        beforeEach(async () => {
          await Effect.runPromise(context.connect());
        });

        it('should handle network disconnection gracefully', async () => {
          await Effect.runPromise(context.simulateDisconnect());

          const state = await Effect.runPromise(context.getConnectionState());
          expect(['disconnected', 'error']).toContain(state);
        });

        it('should reconnect after network restoration', async () => {
          await Effect.runPromise(context.simulateDisconnect());
          await Effect.runPromise(context.simulateReconnect());

          // Give it time to reconnect
          await Effect.runPromise(Effect.sleep(Duration.millis(200)));

          const connected = await Effect.runPromise(context.isConnected());
          expect(connected).toBe(true);
        });

        it('should continue message delivery after reconnection', async () => {
          const messagePromise = Effect.runPromise(
            pipe(
              context.subscribe((msg) => msg.type === 'reconnect-test'),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.take(2),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          // Send first message
          await Effect.runPromise(
            context.publish({
              id: 'before-disconnect',
              type: 'reconnect-test',
              payload: 'before',
            })
          );

          // Simulate disconnect and reconnect
          await Effect.runPromise(context.simulateDisconnect());
          await Effect.runPromise(context.simulateReconnect());
          await Effect.runPromise(Effect.sleep(Duration.millis(100)));

          // Send second message
          await Effect.runPromise(
            context.publish({
              id: 'after-reconnect',
              type: 'reconnect-test',
              payload: 'after',
            })
          );

          const messages = await messagePromise;
          expect(messages).toHaveLength(2);
        });
      });
    }

    describe('REQUIRED: Error Handling', () => {
      beforeEach(async () => {
        await Effect.runPromise(context.connect());
      });

      it('should handle malformed message gracefully', async () => {
        const malformedMessages = [
          {
            id: '',
            type: 'malformed',
            payload: 'empty id',
          },
          {
            id: 'valid-id',
            type: '',
            payload: 'empty type',
          },
          {
            id: 'circular-ref',
            type: 'test',
            payload: {},
          },
        ];

        // Add circular reference
        (malformedMessages[2]!.payload as any).self = malformedMessages[2]!.payload;

        for (const msg of malformedMessages) {
          const result = await Effect.runPromise(
            pipe(
              context.publish(msg),
              Effect.map(() => 'success' as const),
              Effect.catchAll(() => Effect.succeed('handled' as const))
            )
          );
          // Should either succeed or handle gracefully
          expect(['success', 'handled']).toContain(result);
        }

        // Transport should still be functional
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });

      it('should handle extremely large messages appropriately', async () => {
        const largePayload = Array.from({ length: 100000 }, (_, i) => `item-${i}`);
        const largeMessage: TransportMessage = {
          id: 'large-message',
          type: 'size-test',
          payload: { data: largePayload },
        };

        const result = await Effect.runPromise(
          pipe(
            context.publish(largeMessage),
            Effect.map(() => 'success' as const),
            Effect.catchAll(() => Effect.succeed('handled' as const))
          )
        );

        // Should either handle it or reject it gracefully
        expect(['success', 'handled']).toContain(result);
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });

      it('should handle rapid message bursts', async () => {
        const burstSize = 1000;
        const messages = Array.from({ length: burstSize }, (_, i) => ({
          id: `burst-${i}`,
          type: 'burst-test',
          payload: { index: i },
        }));

        // Send all messages rapidly
        const results = await Effect.runPromise(
          Effect.all(
            messages.map((msg) =>
              pipe(
                context.publish(msg),
                Effect.map(() => 'success' as const),
                Effect.catchAll(() => Effect.succeed('handled' as const))
              )
            ),
            { concurrency: 'unbounded' }
          )
        );

        // Should handle the burst gracefully
        expect(results.every((r) => ['success', 'handled'].includes(r))).toBe(true);
        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });
    });

    describe('REQUIRED: Resource Cleanup', () => {
      it('should clean up resources on disconnect', async () => {
        await Effect.runPromise(context.connect());

        // Set up subscription
        const stream = await Effect.runPromise(context.subscribe());

        await Effect.runPromise(context.disconnect());

        // Transport should be properly disconnected
        expect(await Effect.runPromise(context.isConnected())).toBe(false);

        // Connection state should reflect disconnection
        const state = await Effect.runPromise(context.getConnectionState());
        expect(state).toBe('disconnected');
      });

      it('should handle cleanup during active operations', async () => {
        await Effect.runPromise(context.connect());

        // Start a long-running subscription
        const longRunningSubscription = Effect.runPromise(
          pipe(
            context.subscribe(),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(100),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.fork
              )
            ),
            Effect.flatten,
            Effect.catchAll(() => Effect.succeed([] as TransportMessage[]))
          )
        );

        await Effect.runPromise(Effect.sleep(Duration.millis(50)));

        // Disconnect while subscription is active
        await Effect.runPromise(context.disconnect());

        // Should handle cleanup gracefully
        const messages = await longRunningSubscription;
        expect(Array.isArray(messages)).toBe(true);
        expect(await Effect.runPromise(context.isConnected())).toBe(false);
      });
    });
  });
};
