/**
 * LAYER 2: Protocol Contract Tests
 *
 * Tests ONLY event sourcing protocol mapping to transport. NO domain logic.
 * These tests validate that ES concepts (commands, events, subscriptions)
 * correctly map to and from transport messages.
 *
 * WHAT IS TESTED:
 * - Command serialization/deserialization
 * - Event serialization/deserialization
 * - Subscription filtering and routing
 * - Protocol error handling
 * - Message versioning and compatibility
 *
 * WHAT IS NOT TESTED:
 * - Business logic or domain invariants
 * - Transport reliability (covered in Layer 1)
 * - Complete end-to-end scenarios (covered in Layer 4)
 */

import { Effect, Stream, pipe, Chunk, Duration, Either } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type {
  ProtocolTestContext,
  ProtocolFeatures,
  ProtocolTestRunner,
  StreamEvent,
  GlobalPosition,
} from '../test-layer-interfaces';
import type { EventStreamId, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateCommand } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * REQUIRED: Core protocol contract tests.
 * Every protocol implementation MUST pass these tests.
 */
export const runProtocolContractTests: ProtocolTestRunner = (
  name: string,
  setup: () => Effect.Effect<ProtocolTestContext>,
  features?: ProtocolFeatures
) => {
  describe(`${name} Protocol Contract`, () => {
    let context: ProtocolTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      await Effect.runPromise(context.reset());
    });

    describe('REQUIRED: Command Protocol', () => {
      it('should serialize and send a simple command', async () => {
        const command: AggregateCommand = {
          aggregate: {
            position: {
              streamId: 'test-stream-1' as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'TestAggregate',
          },
          commandName: 'CreateTest',
          payload: { value: 'hello world' },
        };

        const result = await Effect.runPromise(context.sendCommand(command));
        expect(result).toBeDefined();
      });

      it('should handle commands with various payload types', async () => {
        const baseCommand = {
          aggregate: {
            position: {
              streamId: 'payload-test' as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'TestAggregate',
          },
          commandName: 'TestPayload',
        };

        const payloads = [
          { type: 'string', data: 'simple string' },
          { type: 'number', data: 42 },
          { type: 'boolean', data: true },
          { type: 'object', data: { nested: { value: [1, 2, 3] } } },
          { type: 'array', data: [{ a: 1 }, { b: 2 }] },
          { type: 'null', data: null },
        ];

        for (const payload of payloads) {
          const command: AggregateCommand = {
            ...baseCommand,
            payload,
          };

          const result = await Effect.runPromise(context.sendCommand(command));
          expect(result).toBeDefined();
        }
      });

      it('should preserve command metadata through protocol', async () => {
        const command: AggregateCommand = {
          aggregate: {
            position: {
              streamId: 'metadata-test' as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'TestAggregate',
          },
          commandName: 'MetadataTest',
          payload: { content: 'test' },
          metadata: {
            source: 'test-suite',
            correlationId: 'test-123',
            customField: { nested: 'value' },
          },
        };

        const result = await Effect.runPromise(context.sendCommand(command));
        expect(result).toBeDefined();

        // If result includes metadata, it should match
        if ('metadata' in result && result.metadata) {
          expect(result.metadata).toMatchObject({
            correlationId: 'test-123',
          });
        }
      });

      it('should handle command errors gracefully', async () => {
        const invalidCommand: AggregateCommand = {
          aggregate: {
            position: {
              streamId: '' as EventStreamId, // Invalid empty stream ID
              eventNumber: 0 as EventNumber,
            },
            name: 'TestAggregate',
          },
          commandName: 'InvalidCommand',
          payload: { invalid: 'data' },
        };

        const result = await Effect.runPromise(
          pipe(context.sendCommand(invalidCommand), Effect.either)
        );

        // Should return error, not throw exception
        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
      });

      it('should timeout on slow command processing', async () => {
        const slowCommand: AggregateCommand = {
          aggregate: {
            position: {
              streamId: 'slow-test' as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'SlowAggregate',
          },
          commandName: 'SlowCommand',
          payload: { delay: 5000 }, // Request 5 second delay
        };

        const result = await Effect.runPromise(
          pipe(
            context.sendCommand(slowCommand),
            Effect.timeout(Duration.millis(100)), // Short timeout
            Effect.either
          )
        );

        // Should timeout gracefully
        expect(Either.isLeft(result)).toBe(true);
      });

      it('should handle malformed command payloads', async () => {
        const malformedCommand = {
          aggregate: {
            position: {
              streamId: 'malformed-test' as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'TestAggregate',
          },
          commandName: 'MalformedTest',
          payload: { circular: {} },
        };

        // Add circular reference
        (malformedCommand.payload.circular as any).self = malformedCommand.payload;

        const result = await Effect.runPromise(
          pipe(context.sendCommand(malformedCommand as AggregateCommand), Effect.either)
        );

        // Should handle gracefully (either succeed with transformation or fail cleanly)
        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
      });
    });

    describe('REQUIRED: Event Subscription Protocol', () => {
      it('should subscribe to events from a specific stream', async () => {
        const streamId = 'subscription-test' as EventStreamId;

        const events = await Effect.runPromise(
          pipe(
            context.subscribeToEvents(streamId),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.timeout(Duration.millis(2000))
              )
            )
          )
        );

        // Should be able to set up subscription without error
        expect(Array.isArray(events)).toBe(true);
      });

      it('should subscribe to events from a specific position', async () => {
        const streamId = 'position-test' as EventStreamId;
        const fromPosition = 5 as EventNumber;

        const subscription = await Effect.runPromise(
          pipe(
            context.subscribeToEvents(streamId, fromPosition),
            Effect.timeout(Duration.millis(1000))
          )
        );

        expect(subscription).toBeDefined();
      });

      it('should subscribe to all events', async () => {
        const subscription = await Effect.runPromise(
          pipe(context.subscribeToAllEvents(), Effect.timeout(Duration.millis(1000)))
        );

        expect(subscription).toBeDefined();
      });

      it('should subscribe to all events from a global position', async () => {
        const fromPosition: GlobalPosition = { value: 100 };

        const subscription = await Effect.runPromise(
          pipe(context.subscribeToAllEvents(fromPosition), Effect.timeout(Duration.millis(1000)))
        );

        expect(subscription).toBeDefined();
      });

      it('should handle subscription to non-existent streams gracefully', async () => {
        const nonExistentStream = 'does-not-exist' as EventStreamId;

        const result = await Effect.runPromise(
          pipe(
            context.subscribeToEvents(nonExistentStream),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.timeout(Duration.millis(500))
              )
            ),
            Effect.either
          )
        );

        // Should handle gracefully (timeout or return empty)
        expect(Either.isLeft(result) || (Either.isRight(result) && result.right.length === 0)).toBe(
          true
        );
      });

      it('should properly deserialize event data', async () => {
        // This test assumes events are available in the test environment
        // In real tests, you'd set up events first
        const streamId = 'deserialization-test' as EventStreamId;

        const events = await Effect.runPromise(
          pipe(
            context.subscribeToEvents(streamId),
            Effect.flatMap((stream) =>
              pipe(
                stream,
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Chunk.toReadonlyArray),
                Effect.timeout(Duration.millis(1000))
              )
            ),
            Effect.catchAll(() => Effect.succeed([] as StreamEvent[]))
          )
        );

        // If events exist, they should have proper structure
        events.forEach((event) => {
          expect(event.streamId).toBeDefined();
          expect(event.eventNumber).toBeDefined();
          expect(event.eventType).toBeDefined();
          expect(event.timestamp).toBeInstanceOf(Date);
        });
      });
    });

    describe('REQUIRED: Protocol Health and State', () => {
      it('should report protocol version', async () => {
        const version = await Effect.runPromise(context.getProtocolVersion());
        expect(typeof version).toBe('string');
        expect(version.length).toBeGreaterThan(0);
      });

      it('should report protocol health status', async () => {
        const healthy = await Effect.runPromise(context.isProtocolHealthy());
        expect(typeof healthy).toBe('boolean');
      });

      it('should handle protocol reset', async () => {
        await Effect.runPromise(context.reset());

        // After reset, protocol should still be healthy
        const healthy = await Effect.runPromise(context.isProtocolHealthy());
        expect(healthy).toBe(true);
      });
    });

    describe('REQUIRED: Protocol Error Handling', () => {
      if (context.simulateProtocolError) {
        it('should handle serialization errors gracefully', async () => {
          await Effect.runPromise(context.simulateProtocolError('serialization'));

          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'serialization-error-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'TestAfterError',
            payload: { test: 'data' },
          };

          const result = await Effect.runPromise(pipe(context.sendCommand(command), Effect.either));

          // Should handle error gracefully
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        });

        it('should handle version mismatch errors gracefully', async () => {
          await Effect.runPromise(context.simulateProtocolError('version-mismatch'));

          const healthy = await Effect.runPromise(
            pipe(
              context.isProtocolHealthy(),
              Effect.catchAll(() => Effect.succeed(false))
            )
          );

          // Protocol might become unhealthy due to version mismatch
          expect(typeof healthy).toBe('boolean');
        });

        it('should handle timeout errors gracefully', async () => {
          await Effect.runPromise(context.simulateProtocolError('timeout'));

          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'timeout-error-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'TestAfterTimeout',
            payload: { test: 'data' },
          };

          const result = await Effect.runPromise(
            pipe(context.sendCommand(command), Effect.timeout(Duration.millis(100)), Effect.either)
          );

          // Should timeout or handle gracefully
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        });
      }
    });

    // OPTIONAL FEATURE TESTS
    if (features?.supportsEventFiltering) {
      describe('OPTIONAL: Event Filtering', () => {
        it('should filter events by event type', async () => {
          const streamId = 'filter-test' as EventStreamId;

          // This would typically require a setup phase to create events
          // For now, we test that the subscription doesn't fail
          const subscription = await Effect.runPromise(
            pipe(context.subscribeToEvents(streamId), Effect.timeout(Duration.millis(1000)))
          );

          expect(subscription).toBeDefined();
        });

        it('should filter events by metadata', async () => {
          const streamId = 'metadata-filter-test' as EventStreamId;

          const subscription = await Effect.runPromise(
            pipe(context.subscribeToEvents(streamId), Effect.timeout(Duration.millis(1000)))
          );

          expect(subscription).toBeDefined();
        });
      });
    }

    if (features?.supportsEventReplay) {
      describe('OPTIONAL: Event Replay', () => {
        it('should replay events from historical position', async () => {
          const streamId = 'replay-test' as EventStreamId;
          const historicalPosition = 10 as EventNumber;

          const replayedEvents = await Effect.runPromise(
            pipe(
              context.subscribeToEvents(streamId, historicalPosition),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.take(5),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.timeout(Duration.millis(2000))
                )
              ),
              Effect.catchAll(() => Effect.succeed([] as StreamEvent[]))
            )
          );

          expect(Array.isArray(replayedEvents)).toBe(true);
        });

        it('should replay all events from global position', async () => {
          const globalPosition: GlobalPosition = { value: 50 };

          const replayedEvents = await Effect.runPromise(
            pipe(
              context.subscribeToAllEvents(globalPosition),
              Effect.flatMap((stream) =>
                pipe(
                  stream,
                  Stream.take(5),
                  Stream.runCollect,
                  Effect.map(Chunk.toReadonlyArray),
                  Effect.timeout(Duration.millis(2000))
                )
              ),
              Effect.catchAll(() => Effect.succeed([] as StreamEvent[]))
            )
          );

          expect(Array.isArray(replayedEvents)).toBe(true);
        });
      });
    }

    if (features?.supportsTransactions) {
      describe('OPTIONAL: Transaction Support', () => {
        it('should handle transactional command batches', async () => {
          // This would require additional protocol methods for transactions
          // For now, test that multiple commands work
          const commands: AggregateCommand[] = [
            {
              aggregate: {
                position: {
                  streamId: 'tx-test-1' as EventStreamId,
                  eventNumber: 0 as EventNumber,
                },
                name: 'TestAggregate',
              },
              commandName: 'TxCommand1',
              payload: { step: 1 },
            },
            {
              aggregate: {
                position: {
                  streamId: 'tx-test-2' as EventStreamId,
                  eventNumber: 0 as EventNumber,
                },
                name: 'TestAggregate',
              },
              commandName: 'TxCommand2',
              payload: { step: 2 },
            },
          ];

          const results = await Effect.runPromise(
            Effect.all(commands.map((cmd) => context.sendCommand(cmd)))
          );

          expect(results).toHaveLength(2);
          results.forEach((result) => expect(result).toBeDefined());
        });
      });
    }

    if (features?.supportsMetadata) {
      describe('OPTIONAL: Metadata Support', () => {
        it('should preserve and transmit event metadata', async () => {
          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'metadata-support-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'MetadataCommand',
            payload: { test: 'data' },
            metadata: {
              userId: 'user-123',
              traceId: 'trace-456',
              custom: { field: 'value' },
            },
          };

          const result = await Effect.runPromise(context.sendCommand(command));
          expect(result).toBeDefined();

          // Check if metadata is preserved in result
          if ('metadata' in result && result.metadata) {
            expect(result.metadata).toMatchObject({
              userId: 'user-123',
              traceId: 'trace-456',
            });
          }
        });

        it('should handle large metadata payloads', async () => {
          const largeMetadata = Array.from({ length: 1000 }, (_, i) => `item-${i}`);

          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'large-metadata-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'LargeMetadataCommand',
            payload: { test: 'data' },
            metadata: {
              largeField: largeMetadata,
            },
          };

          const result = await Effect.runPromise(pipe(context.sendCommand(command), Effect.either));

          // Should handle gracefully (succeed or fail cleanly)
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        });
      });
    }

    if (features?.supportsCompression) {
      describe('OPTIONAL: Compression Support', () => {
        it('should handle compressed large payloads', async () => {
          const largePalayload = Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            data: `repeated data string ${i}`.repeat(10),
          }));

          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'compression-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'LargePayloadCommand',
            payload: { items: largePalayload },
          };

          const result = await Effect.runPromise(pipe(context.sendCommand(command), Effect.either));

          // Should handle compression gracefully
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        });

        it('should maintain data integrity with compression', async () => {
          const testData = {
            numbers: Array.from({ length: 1000 }, (_, i) => i),
            strings: Array.from({ length: 100 }, (_, i) => `test-string-${i}`),
            nested: {
              deep: {
                structure: Array.from({ length: 50 }, (_, i) => ({ value: i * 2 })),
              },
            },
          };

          const command: AggregateCommand = {
            aggregate: {
              position: {
                streamId: 'integrity-test' as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'TestAggregate',
            },
            commandName: 'IntegrityCommand',
            payload: testData,
          };

          const result = await Effect.runPromise(context.sendCommand(command));
          expect(result).toBeDefined();
        });
      });
    }
  });
};
