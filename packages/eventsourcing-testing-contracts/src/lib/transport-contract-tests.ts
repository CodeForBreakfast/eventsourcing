/**
 * Transport Contract Tests
 *
 * Re-exports and extends the transport contract tests from the transport-contracts package.
 * This module provides additional test utilities and customizations specific to
 * event sourcing transport testing scenarios.
 */

// Re-export the core transport testing functionality
export {
  runTransportContractTests,
  type TransportTestContext,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// Additional test utilities specific to event sourcing scenarios
import { Effect, Stream, pipe, Chunk, Duration } from 'effect';
import { describe, expect, it } from 'bun:test';
import type {
  TransportMessage,
  TransportTestContext,
  TransportFeatures,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

/**
 * Extended transport test context for event sourcing scenarios.
 * Adds event sourcing specific test helpers on top of the base transport context.
 */
export interface EventSourcingTransportTestContext<
  TMessage extends TransportMessage = TransportMessage,
> extends TransportTestContext<TMessage> {
  // Event sourcing specific test helpers
  readonly simulateSlowNetwork?: () => Effect.Effect<void>;
  readonly simulateHighLatency?: (delayMs: number) => Effect.Effect<void>;
  readonly getMessageMetrics?: () => Effect.Effect<{
    messagesSent: number;
    messagesReceived: number;
    averageLatency: number;
    connectionDrops: number;
  }>;
}

/**
 * Event sourcing specific transport features
 */
export interface EventSourcingTransportFeatures extends TransportFeatures {
  readonly supportsEventOrdering?: boolean;
  readonly supportsEventReplay?: boolean;
  readonly supportsStreamFiltering?: boolean;
  readonly supportsMetrics?: boolean;
}

/**
 * Extended transport contract test suite specifically for event sourcing transports.
 * Includes additional tests for event sourcing scenarios like stream filtering,
 * event ordering, and replay capabilities.
 */
export function runEventSourcingTransportTests<
  TMessage extends TransportMessage = TransportMessage,
>(
  name: string,
  setup: () => Effect.Effect<EventSourcingTransportTestContext<TMessage>, never, never>,
  features?: EventSourcingTransportFeatures
) {
  describe(`${name} Event Sourcing Transport Contract`, () => {
    if (features?.supportsStreamFiltering) {
      describe('OPTIONAL: Event Stream Filtering', () => {
        it('should filter messages by stream ID patterns', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          // Subscribe to messages with specific stream pattern
          const streamFilter = (msg: TMessage) =>
            msg.type === 'stream-event' && (msg.payload as any)?.streamId?.startsWith('user-');

          const filteredMessages = await Effect.runPromise(
            pipe(
              context.subscribe(streamFilter),
              Effect.map((stream) =>
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

          // Send various messages
          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          const messages = [
            {
              id: '1',
              type: 'stream-event',
              payload: { streamId: 'user-123', event: 'UserCreated' },
              timestamp: new Date(),
            },
            {
              id: '2',
              type: 'stream-event',
              payload: { streamId: 'order-456', event: 'OrderPlaced' },
              timestamp: new Date(),
            },
            {
              id: '3',
              type: 'stream-event',
              payload: { streamId: 'user-789', event: 'UserUpdated' },
              timestamp: new Date(),
            },
          ] as TMessage[];

          for (const msg of messages) {
            await Effect.runPromise(context.publish(msg));
          }

          const results = await Effect.runPromise(Fiber.join(filteredMessages));
          expect(results).toHaveLength(2);
          expect(results.every((msg) => (msg.payload as any)?.streamId?.startsWith('user-'))).toBe(
            true
          );
        });

        it('should handle complex filter predicates', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          // Complex filter: events from specific aggregates with specific event types
          const complexFilter = (msg: TMessage) => {
            const payload = msg.payload as any;
            return (
              msg.type === 'aggregate-event' &&
              ['User', 'Order'].includes(payload?.aggregateType) &&
              ['Created', 'Updated'].includes(payload?.eventType)
            );
          };

          const filteredMessages = await Effect.runPromise(
            pipe(
              context.subscribe(complexFilter),
              Effect.map((stream) =>
                pipe(
                  stream,
                  Stream.take(3),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          const messages = [
            {
              id: '1',
              type: 'aggregate-event',
              payload: { aggregateType: 'User', eventType: 'Created' },
              timestamp: new Date(),
            },
            {
              id: '2',
              type: 'aggregate-event',
              payload: { aggregateType: 'Product', eventType: 'Created' },
              timestamp: new Date(),
            },
            {
              id: '3',
              type: 'aggregate-event',
              payload: { aggregateType: 'Order', eventType: 'Updated' },
              timestamp: new Date(),
            },
            {
              id: '4',
              type: 'aggregate-event',
              payload: { aggregateType: 'User', eventType: 'Deleted' },
              timestamp: new Date(),
            },
            {
              id: '5',
              type: 'aggregate-event',
              payload: { aggregateType: 'Order', eventType: 'Created' },
              timestamp: new Date(),
            },
          ] as TMessage[];

          for (const msg of messages) {
            await Effect.runPromise(context.publish(msg));
          }

          const results = await Effect.runPromise(Fiber.join(filteredMessages));
          expect(results).toHaveLength(3);
        });
      });
    }

    if (features?.supportsEventOrdering) {
      describe('OPTIONAL: Event Ordering', () => {
        it('should maintain strict ordering within event streams', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          const streamId = `test-stream-${Date.now()}`;
          const orderedMessages = await Effect.runPromise(
            pipe(
              context.subscribe(
                (msg) => msg.type === 'ordered-event' && (msg.payload as any)?.streamId === streamId
              ),
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

          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          // Send events with sequence numbers
          for (let i = 0; i < 10; i++) {
            await Effect.runPromise(
              context.publish({
                id: `event-${i}`,
                type: 'ordered-event',
                payload: { streamId, sequence: i },
                timestamp: new Date(),
              } as TMessage)
            );
          }

          const results = await Effect.runPromise(Fiber.join(orderedMessages));
          expect(results).toHaveLength(10);

          // Verify ordering
          results.forEach((msg, index) => {
            expect((msg.payload as any).sequence).toBe(index);
          });
        });

        it('should handle out-of-order delivery with reordering', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          const streamId = `reorder-stream-${Date.now()}`;
          const orderedMessages = await Effect.runPromise(
            pipe(
              context.subscribe(
                (msg) => msg.type === 'reorder-event' && (msg.payload as any)?.streamId === streamId
              ),
              Effect.map((stream) =>
                pipe(
                  stream,
                  Stream.take(5),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          await Effect.runPromise(Effect.sleep(Duration.millis(50)));

          // Send events out of order intentionally
          const sequences = [0, 2, 1, 4, 3];
          for (const seq of sequences) {
            await Effect.runPromise(
              context.publish({
                id: `event-${seq}`,
                type: 'reorder-event',
                payload: { streamId, sequence: seq },
                timestamp: new Date(),
              } as TMessage)
            );
          }

          const results = await Effect.runPromise(Fiber.join(orderedMessages));
          expect(results).toHaveLength(5);

          // Verify proper ordering was maintained/restored
          results.forEach((msg, index) => {
            expect((msg.payload as any).sequence).toBe(index);
          });
        });
      });
    }

    if (features?.supportsEventReplay) {
      describe('OPTIONAL: Event Replay', () => {
        it('should support replaying events from a specific position', async () => {
          const context = await Effect.runPromise(setup());
          await Effect.runPromise(context.connect());

          const streamId = `replay-stream-${Date.now()}`;

          // First, send some events
          for (let i = 0; i < 10; i++) {
            await Effect.runPromise(
              context.publish({
                id: `event-${i}`,
                type: 'replay-event',
                payload: { streamId, sequence: i },
                timestamp: new Date(),
              } as TMessage)
            );
          }

          await Effect.runPromise(Effect.sleep(Duration.millis(100)));

          // Now subscribe from position 5
          const replayMessages = await Effect.runPromise(
            pipe(
              context.subscribe(
                (msg) =>
                  msg.type === 'replay-event' &&
                  (msg.payload as any)?.streamId === streamId &&
                  (msg.payload as any)?.sequence >= 5
              ),
              Effect.map((stream) =>
                pipe(
                  stream,
                  Stream.take(5),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.fork
                )
              ),
              Effect.flatten
            )
          );

          const results = await Effect.runPromise(Fiber.join(replayMessages));
          expect(results).toHaveLength(5);
          expect((results[0]?.payload as any)?.sequence).toBe(5);
          expect((results[4]?.payload as any)?.sequence).toBe(9);
        });
      });
    }

    if (features?.supportsMetrics) {
      describe('OPTIONAL: Transport Metrics', () => {
        it('should track message throughput metrics', async () => {
          const context = await Effect.runPromise(setup());
          if (!context.getMessageMetrics) {
            return; // Skip if metrics not supported
          }

          await Effect.runPromise(context.connect());

          // Send several messages
          for (let i = 0; i < 10; i++) {
            await Effect.runPromise(
              context.publish({
                id: `metric-${i}`,
                type: 'metric-test',
                payload: { index: i },
                timestamp: new Date(),
              } as TMessage)
            );
          }

          await Effect.runPromise(Effect.sleep(Duration.millis(100)));

          const metrics = await Effect.runPromise(context.getMessageMetrics());
          expect(metrics.messagesSent).toBe(10);
          expect(metrics.averageLatency).toBeGreaterThan(0);
        });

        it('should track connection stability metrics', async () => {
          const context = await Effect.runPromise(setup());
          if (
            !context.getMessageMetrics ||
            !context.simulateDisconnect ||
            !context.simulateReconnect
          ) {
            return;
          }

          await Effect.runPromise(context.connect());

          // Simulate some connection drops
          await Effect.runPromise(context.simulateDisconnect());
          await Effect.runPromise(Effect.sleep(Duration.millis(50)));
          await Effect.runPromise(context.simulateReconnect());

          const metrics = await Effect.runPromise(context.getMessageMetrics());
          expect(metrics.connectionDrops).toBeGreaterThan(0);
        });
      });
    }

    describe('Event Sourcing Specific Error Handling', () => {
      it('should handle invalid event stream IDs gracefully', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        const invalidMessages = [
          {
            id: '1',
            type: 'stream-event',
            payload: { streamId: '', event: 'test' },
            timestamp: new Date(),
          },
          {
            id: '2',
            type: 'stream-event',
            payload: { streamId: null, event: 'test' },
            timestamp: new Date(),
          },
          {
            id: '3',
            type: 'stream-event',
            payload: { streamId: undefined, event: 'test' },
            timestamp: new Date(),
          },
        ] as TMessage[];

        for (const msg of invalidMessages) {
          const result = await Effect.runPromise(
            pipe(
              context.publish(msg),
              Effect.map(() => 'success'),
              Effect.catchAll(() => Effect.succeed('error'))
            )
          );
          // Should handle gracefully
          expect(['success', 'error']).toContain(result);
        }

        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });

      it('should handle malformed event payloads gracefully', async () => {
        const context = await Effect.runPromise(setup());
        await Effect.runPromise(context.connect());

        const malformedMessages = [
          {
            id: '1',
            type: 'event',
            payload: { circular: {} },
            timestamp: new Date(),
          },
          {
            id: '2',
            type: 'event',
            payload: Symbol('invalid'),
            timestamp: new Date(),
          },
          {
            id: '3',
            type: 'event',
            payload: new Date(), // Non-serializable in some contexts
            timestamp: new Date(),
          },
        ] as TMessage[];

        // Add circular reference
        (malformedMessages[0]!.payload as any).circular.self = malformedMessages[0]!.payload;

        for (const msg of malformedMessages) {
          const result = await Effect.runPromise(
            pipe(
              context.publish(msg),
              Effect.map(() => 'success'),
              Effect.catchAll(() => Effect.succeed('error'))
            )
          );
          // Should handle gracefully
          expect(['success', 'error']).toContain(result);
        }

        expect(await Effect.runPromise(context.isConnected())).toBe(true);
      });
    });
  });
}
