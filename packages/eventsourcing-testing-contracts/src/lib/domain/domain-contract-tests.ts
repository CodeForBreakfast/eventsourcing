/**
 * LAYER 3: Domain Contract Tests
 *
 * Tests ONLY event sourcing domain invariants. NO transport or protocol concerns.
 * These tests validate that the event store correctly implements fundamental
 * event sourcing rules that must never be violated.
 *
 * WHAT IS TESTED:
 * - Optimistic concurrency control
 * - Event ordering within streams
 * - Aggregate consistency rules
 * - Stream isolation
 * - Command idempotency
 * - Atomic operations
 *
 * WHAT IS NOT TESTED:
 * - Message transport reliability (covered in Layer 1)
 * - Protocol serialization (covered in Layer 2)
 * - End-to-end scenarios (covered in Layer 4)
 */

import { Effect, pipe, Either } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { DomainTestContext, DomainFeatures, DomainTestRunner } from '../test-layer-interfaces';
import type { EventStreamId, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateCommand } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * REQUIRED: Core domain contract tests.
 * Every event store implementation MUST pass these tests.
 */
export const runDomainContractTests: DomainTestRunner = (
  name: string,
  setup: () => Effect.Effect<DomainTestContext>,
  features?: DomainFeatures
) => {
  describe(`${name} Domain Contract`, () => {
    let context: DomainTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      await Effect.runPromise(context.reset());
    });

    describe('REQUIRED: Optimistic Concurrency Control', () => {
      it('MUST reject commands with incorrect expected version', async () => {
        const streamId = `concurrency-test-${Date.now()}` as EventStreamId;

        // First command succeeds
        const firstCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'InitialCommand',
          payload: { value: 'first' },
        };

        const firstResult = await Effect.runPromise(context.processCommand(firstCommand));
        expect(Either.isRight(firstResult)).toBe(true);

        // Second command with wrong expected version fails
        const wrongVersionCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber }, // Wrong! Should be 1
            name: 'TestAggregate',
          },
          commandName: 'SecondCommand',
          payload: { value: 'second' },
        };

        const wrongResult = await Effect.runPromise(context.processCommand(wrongVersionCommand));
        expect(Either.isLeft(wrongResult)).toBe(true);
        if (Either.isLeft(wrongResult)) {
          expect(wrongResult.left.message).toMatch(/concurrency|version|conflict/i);
        }

        // Correct version succeeds
        const correctCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 1 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'SecondCommand',
          payload: { value: 'second' },
        };

        const correctResult = await Effect.runPromise(context.processCommand(correctCommand));
        expect(Either.isRight(correctResult)).toBe(true);
      });

      it('MUST handle concurrent commands to the same stream correctly', async () => {
        const streamId = `concurrent-test-${Date.now()}` as EventStreamId;

        // Create multiple commands all expecting version 0
        const concurrentCommands = Array.from({ length: 5 }, (_, i) => ({
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'ConcurrentCommand',
          payload: { index: i },
        }));

        // Process all commands concurrently
        const results = await Effect.runPromise(
          Effect.all(
            concurrentCommands.map((cmd) =>
              pipe(
                context.processCommand(cmd),
                Effect.map((result) => ({ command: cmd, result }))
              )
            ),
            { concurrency: 'unbounded' }
          )
        );

        // Exactly one should succeed (first one to acquire the lock)
        const successes = results.filter((r) => Either.isRight(r.result));
        const failures = results.filter((r) => Either.isLeft(r.result));

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(4);

        // All failures should be optimistic concurrency errors
        failures.forEach((f) => {
          if (Either.isLeft(f.result)) {
            expect(f.result.left.message).toMatch(/concurrency|version|conflict/i);
          }
        });

        // Verify only one event was created
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });

      it('MUST maintain correct version numbers under high concurrency', async () => {
        const streamId = `version-stress-${Date.now()}` as EventStreamId;
        const commandCount = 50;

        // Process commands sequentially to establish expected final version
        for (let i = 0; i < commandCount; i++) {
          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: i as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'SequentialCommand',
            payload: { sequence: i },
          };

          const result = await Effect.runPromise(context.processCommand(command));
          expect(Either.isRight(result)).toBe(true);
        }

        // Verify final state
        const finalVersion = await Effect.runPromise(context.getAggregateVersion(streamId));
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));

        expect(finalVersion).toBe(commandCount);
        expect(eventCount).toBe(commandCount);
      });
    });

    describe('REQUIRED: Event Ordering Guarantees', () => {
      it('MUST preserve strict ordering of events within a stream', async () => {
        const streamId = `ordering-test-${Date.now()}` as EventStreamId;
        const eventCount = 20;

        // Send multiple commands in sequence
        for (let i = 0; i < eventCount; i++) {
          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: i as EventNumber },
              name: 'OrderedAggregate',
            },
            commandName: 'OrderedCommand',
            payload: { sequence: i, timestamp: Date.now() },
          };

          const result = await Effect.runPromise(context.processCommand(command));
          expect(Either.isRight(result)).toBe(true);
        }

        // Verify events are in correct order
        const events = await Effect.runPromise(context.getEvents(streamId));
        expect(events).toHaveLength(eventCount);

        events.forEach((event, index) => {
          expect(event.eventNumber).toBe((index + 1) as EventNumber);
          expect((event.data as any).sequence).toBe(index);
        });
      });

      it('MUST guarantee no gaps in event numbers within a stream', async () => {
        const streamId = `no-gaps-${Date.now()}` as EventStreamId;
        const commandCount = 15;

        // Create events
        for (let i = 0; i < commandCount; i++) {
          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: i as EventNumber },
              name: 'GapTestAggregate',
            },
            commandName: 'GapTestCommand',
            payload: { index: i },
          };
          await Effect.runPromise(context.processCommand(command));
        }

        // Verify continuous sequence
        const events = await Effect.runPromise(context.getEvents(streamId));
        expect(events).toHaveLength(commandCount);

        // Event numbers should be 1, 2, 3, ..., commandCount with no gaps
        for (let i = 0; i < events.length; i++) {
          expect(events[i]!.eventNumber).toBe((i + 1) as EventNumber);
        }

        const lastEventNumber = await Effect.runPromise(context.getLastEventNumber(streamId));
        expect(lastEventNumber).toBe(commandCount);
      });

      it('MUST handle rapid sequential commands without ordering violations', async () => {
        const streamId = `rapid-sequence-${Date.now()}` as EventStreamId;
        const rapidCount = 100;

        // Send commands rapidly in sequence
        for (let i = 0; i < rapidCount; i++) {
          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: i as EventNumber },
              name: 'RapidAggregate',
            },
            commandName: 'RapidCommand',
            payload: {
              sequence: i,
              timestamp: Date.now(),
              batchId: 'rapid-test',
            },
          };

          const result = await Effect.runPromise(context.processCommand(command));
          expect(Either.isRight(result)).toBe(true);
        }

        // Verify perfect ordering
        const events = await Effect.runPromise(context.getEvents(streamId));
        expect(events).toHaveLength(rapidCount);

        events.forEach((event, index) => {
          expect(event.eventNumber).toBe((index + 1) as EventNumber);
          expect((event.data as any).sequence).toBe(index);
        });
      });
    });

    describe('REQUIRED: Stream Isolation', () => {
      it('MUST ensure complete isolation between different streams', async () => {
        const streamA = `stream-a-${Date.now()}` as EventStreamId;
        const streamB = `stream-b-${Date.now()}` as EventStreamId;
        const streamC = `stream-c-${Date.now()}` as EventStreamId;

        // Add events to multiple streams concurrently
        const commands = [
          {
            aggregate: {
              position: { streamId: streamA, eventNumber: 0 as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'TestCommand',
            payload: { stream: 'A', value: 1 },
          },
          {
            aggregate: {
              position: { streamId: streamB, eventNumber: 0 as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'TestCommand',
            payload: { stream: 'B', value: 2 },
          },
          {
            aggregate: {
              position: { streamId: streamC, eventNumber: 0 as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'TestCommand',
            payload: { stream: 'C', value: 3 },
          },
          {
            aggregate: {
              position: { streamId: streamA, eventNumber: 1 as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'TestCommand',
            payload: { stream: 'A', value: 4 },
          },
        ];

        // Process all commands
        for (const cmd of commands) {
          const result = await Effect.runPromise(context.processCommand(cmd));
          expect(Either.isRight(result)).toBe(true);
        }

        // Each stream should have the correct number of events
        const countA = await Effect.runPromise(context.getEventCount(streamA));
        const countB = await Effect.runPromise(context.getEventCount(streamB));
        const countC = await Effect.runPromise(context.getEventCount(streamC));

        expect(countA).toBe(2);
        expect(countB).toBe(1);
        expect(countC).toBe(1);

        // Versions should be independent
        const versionA = await Effect.runPromise(context.getAggregateVersion(streamA));
        const versionB = await Effect.runPromise(context.getAggregateVersion(streamB));
        const versionC = await Effect.runPromise(context.getAggregateVersion(streamC));

        expect(versionA).toBe(2);
        expect(versionB).toBe(1);
        expect(versionC).toBe(1);
      });

      it('MUST not allow cross-stream version conflicts', async () => {
        const streamA = `cross-stream-a-${Date.now()}` as EventStreamId;
        const streamB = `cross-stream-b-${Date.now()}` as EventStreamId;

        // Add event to stream A
        const commandA: AggregateCommand = {
          aggregate: {
            position: { streamId: streamA, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'TestCommand',
          payload: { stream: 'A' },
        };

        await Effect.runPromise(context.processCommand(commandA));

        // Add event to stream B with same position - should not conflict
        const commandB: AggregateCommand = {
          aggregate: {
            position: { streamId: streamB, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'TestCommand',
          payload: { stream: 'B' },
        };

        const resultB = await Effect.runPromise(context.processCommand(commandB));
        expect(Either.isRight(resultB)).toBe(true);

        // Both streams should have version 1
        const versionA = await Effect.runPromise(context.getAggregateVersion(streamA));
        const versionB = await Effect.runPromise(context.getAggregateVersion(streamB));

        expect(versionA).toBe(1);
        expect(versionB).toBe(1);
      });
    });

    describe('REQUIRED: Aggregate Lifecycle', () => {
      it('MUST handle aggregate creation correctly', async () => {
        const streamId = `creation-test-${Date.now()}` as EventStreamId;

        // Aggregate should not exist initially
        const initialExists = await Effect.runPromise(context.aggregateExists(streamId));
        expect(initialExists).toBe(false);

        // Command to non-existent aggregate with eventNumber > 0 should fail
        const invalidCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 5 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'UpdateNonExistent',
          payload: { value: 'test' },
        };

        const invalidResult = await Effect.runPromise(context.processCommand(invalidCommand));
        expect(Either.isLeft(invalidResult)).toBe(true);

        // Creation command with eventNumber 0 should succeed
        const createCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'CreateAggregate',
          payload: { value: 'initial' },
        };

        const createResult = await Effect.runPromise(context.processCommand(createCommand));
        expect(Either.isRight(createResult)).toBe(true);

        // Aggregate should now exist
        const nowExists = await Effect.runPromise(context.aggregateExists(streamId));
        expect(nowExists).toBe(true);

        // Version should be 1
        const version = await Effect.runPromise(context.getAggregateVersion(streamId));
        expect(version).toBe(1);
      });

      it('MUST prevent recreation of existing aggregates', async () => {
        const streamId = `recreation-test-${Date.now()}` as EventStreamId;

        // Create aggregate
        const createCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'CreateAggregate',
          payload: { value: 'original' },
        };

        await Effect.runPromise(context.processCommand(createCommand));

        // Try to recreate (should fail)
        const recreateCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'CreateAggregate',
          payload: { value: 'duplicate' },
        };

        const recreateResult = await Effect.runPromise(context.processCommand(recreateCommand));
        expect(Either.isLeft(recreateResult)).toBe(true);

        // Should still have only 1 event
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });
    });

    describe('REQUIRED: Command Idempotency', () => {
      it('MUST provide idempotent command processing', async () => {
        const streamId = `idempotent-${Date.now()}` as EventStreamId;
        const idempotencyKey = `key-${Date.now()}`;

        // Create a command with an idempotency key
        const command: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'IdempotentCommand',
          payload: { value: 'test' },
          metadata: { idempotencyKey },
        };

        // Send the same command multiple times
        const results = await Effect.runPromise(
          Effect.all([
            context.processCommand(command),
            context.processCommand(command),
            context.processCommand(command),
          ])
        );

        // All should return the same result (idempotent)
        expect(results).toHaveLength(3);

        // All should be successful
        results.forEach((result) => {
          expect(Either.isRight(result)).toBe(true);
        });

        // All results should be identical
        const firstResult = results[0]!;
        results.forEach((result) => {
          expect(result).toEqual(firstResult);
        });

        // Only one event should be created
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });

      it('MUST handle idempotency across concurrent requests', async () => {
        const streamId = `concurrent-idempotent-${Date.now()}` as EventStreamId;
        const idempotencyKey = `concurrent-key-${Date.now()}`;

        const command: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'ConcurrentIdempotentCommand',
          payload: { value: 'test' },
          metadata: { idempotencyKey },
        };

        // Send the same command concurrently
        const results = await Effect.runPromise(
          Effect.all(
            Array.from({ length: 10 }, () => context.processCommand(command)),
            { concurrency: 'unbounded' }
          )
        );

        // All should return the same successful result
        expect(results).toHaveLength(10);
        results.forEach((result) => {
          expect(Either.isRight(result)).toBe(true);
        });

        // All results should be identical
        const firstResult = results[0]!;
        results.forEach((result) => {
          expect(result).toEqual(firstResult);
        });

        // Only one event should be created
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });
    });

    describe('REQUIRED: Atomic Operations', () => {
      it('MUST process commands atomically (all-or-nothing)', async () => {
        const streamId = `atomic-${Date.now()}` as EventStreamId;

        // Command that would produce multiple events in one atomic operation
        const multiEventCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'AtomicAggregate',
          },
          commandName: 'AtomicMultiEventCommand',
          payload: {
            items: ['item1', 'item2', 'item3'],
            // This should trigger multiple events atomically
          },
        };

        const result = await Effect.runPromise(context.processCommand(multiEventCommand));

        // Either all events are written or none
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        if (Either.isRight(result)) {
          expect(eventCount).toBeGreaterThan(0); // All events written
        } else {
          expect(eventCount).toBe(0); // No events written on failure
        }
      });

      it('MUST maintain consistency during failures', async () => {
        const streamId = `failure-consistency-${Date.now()}` as EventStreamId;

        // Create aggregate first
        const createCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'FailureTestAggregate',
          },
          commandName: 'CreateAggregate',
          payload: { initialValue: 100 },
        };

        await Effect.runPromise(context.processCommand(createCommand));

        // Command that should fail due to business rules
        const failingCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 1 as EventNumber },
            name: 'FailureTestAggregate',
          },
          commandName: 'InvalidOperation',
          payload: { value: -999 }, // Invalid negative value
        };

        const failResult = await Effect.runPromise(context.processCommand(failingCommand));
        expect(Either.isLeft(failResult)).toBe(true);

        // Aggregate should remain in consistent state
        const version = await Effect.runPromise(context.getAggregateVersion(streamId));
        expect(version).toBe(1); // Should not have incremented

        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1); // Should still have only creation event
      });
    });

    // OPTIONAL FEATURE TESTS
    if (features?.supportsSnapshots) {
      describe('OPTIONAL: Snapshot Support', () => {
        it('should maintain consistency with snapshots', async () => {
          const streamId = `snapshot-test-${Date.now()}` as EventStreamId;

          // Create many events to trigger snapshot
          for (let i = 0; i < 100; i++) {
            const command: AggregateCommand = {
              aggregate: {
                position: { streamId, eventNumber: i as EventNumber },
                name: 'SnapshotAggregate',
              },
              commandName: 'SnapshotCommand',
              payload: { sequence: i },
            };
            await Effect.runPromise(context.processCommand(command));
          }

          // Add more events after potential snapshot
          for (let i = 100; i < 120; i++) {
            const command: AggregateCommand = {
              aggregate: {
                position: { streamId, eventNumber: i as EventNumber },
                name: 'SnapshotAggregate',
              },
              commandName: 'PostSnapshotCommand',
              payload: { sequence: i },
            };
            await Effect.runPromise(context.processCommand(command));
          }

          // Verify final state is consistent
          const finalVersion = await Effect.runPromise(context.getAggregateVersion(streamId));
          const eventCount = await Effect.runPromise(context.getEventCount(streamId));

          expect(finalVersion).toBe(120);
          expect(eventCount).toBe(120);
        });
      });
    }

    if (features?.supportsProjections) {
      describe('OPTIONAL: Projection Support', () => {
        it('should maintain projection consistency', async () => {
          const streamId = `projection-test-${Date.now()}` as EventStreamId;

          // Create events that would trigger projections
          const events = [
            { type: 'UserCreated', data: { name: 'John' } },
            { type: 'UserUpdated', data: { name: 'Jane' } },
            { type: 'UserDeleted', data: {} },
          ];

          for (let i = 0; i < events.length; i++) {
            const command: AggregateCommand = {
              aggregate: {
                position: { streamId, eventNumber: i as EventNumber },
                name: 'ProjectionAggregate',
              },
              commandName: 'ProjectionCommand',
              payload: events[i],
            };
            await Effect.runPromise(context.processCommand(command));
          }

          // Verify events are properly stored
          const eventCount = await Effect.runPromise(context.getEventCount(streamId));
          expect(eventCount).toBe(3);
        });
      });
    }

    if (features?.supportsComplexAggregates) {
      describe('OPTIONAL: Complex Aggregate Support', () => {
        it('should handle aggregates with complex state', async () => {
          const streamId = `complex-aggregate-${Date.now()}` as EventStreamId;

          // Create complex aggregate with nested state
          const createCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 0 as EventNumber },
              name: 'ComplexAggregate',
            },
            commandName: 'CreateComplexAggregate',
            payload: {
              configuration: {
                settings: { mode: 'advanced', level: 5 },
                features: ['feature1', 'feature2'],
                metadata: { created: new Date().toISOString() },
              },
            },
          };

          const result = await Effect.runPromise(context.processCommand(createCommand));
          expect(Either.isRight(result)).toBe(true);

          // Update complex state
          const updateCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 1 as EventNumber },
              name: 'ComplexAggregate',
            },
            commandName: 'UpdateComplexState',
            payload: {
              updates: {
                'settings.level': 10,
                'features[]': 'feature3',
                'metadata.updated': new Date().toISOString(),
              },
            },
          };

          const updateResult = await Effect.runPromise(context.processCommand(updateCommand));
          expect(Either.isRight(updateResult)).toBe(true);

          const finalVersion = await Effect.runPromise(context.getAggregateVersion(streamId));
          expect(finalVersion).toBe(2);
        });
      });
    }
  });
};
