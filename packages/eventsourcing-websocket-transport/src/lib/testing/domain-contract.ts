/**
 * Domain Contract Tests
 *
 * These tests validate the event sourcing domain behaviors that any
 * transport implementation must respect, regardless of how messages
 * are delivered. These are REQUIRED behaviors.
 */

import { Effect, pipe, Either } from 'effect';
import { describe, expect, it } from 'bun:test';
import type { EventStreamId, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateCommand, CommandResult } from '../event-transport';

/**
 * Test helpers for domain consistency
 */
interface DomainTestContext {
  readonly processCommand: (command: AggregateCommand) => Effect.Effect<CommandResult>;
  readonly getEventCount: (streamId: EventStreamId) => Effect.Effect<number>;
  readonly getLastEventNumber: (streamId: EventStreamId) => Effect.Effect<EventNumber>;
  readonly reset: () => Effect.Effect<void>;
}

/**
 * Domain contract test suite.
 *
 * These tests ensure that any transport + backend combination correctly
 * implements event sourcing domain rules.
 *
 * @param name - Name of the implementation being tested
 * @param setup - Function that creates a test context with domain operations
 */
export function runDomainContractTests(
  name: string,
  setup: () => Effect.Effect<DomainTestContext, never, never>
) {
  describe(`${name} Domain Contract`, () => {
    describe('Event Ordering Guarantees', () => {
      it('MUST preserve strict ordering of events within a stream', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `test-stream-${Date.now()}` as EventStreamId;

        // Send multiple commands in sequence
        const commands = Array.from({ length: 10 }, (_, i) => ({
          aggregate: {
            position: { streamId, eventNumber: i as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'TestCommand',
          payload: { sequence: i },
        }));

        // Process commands sequentially
        for (const cmd of commands) {
          const result = await Effect.runPromise(context.processCommand(cmd));
          expect(Either.isRight(result)).toBe(true);
          if (Either.isRight(result)) {
            expect(result.right.eventNumber).toBe(cmd.aggregate.position.eventNumber + 1);
          }
        }

        // Verify final state
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(10);

        const lastEventNumber = await Effect.runPromise(context.getLastEventNumber(streamId));
        expect(lastEventNumber).toBe(10);
      });

      it('MUST reject commands with incorrect expected version (optimistic concurrency)', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `test-stream-${Date.now()}` as EventStreamId;

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
          expect(wrongResult.left.message).toContain('concurrency');
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
        const context = await Effect.runPromise(setup());
        const streamId = `test-stream-${Date.now()}` as EventStreamId;

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
            expect(f.result.left.message).toContain('concurrency');
          }
        });
      });
    });

    describe('Aggregate Consistency', () => {
      it('MUST maintain consistency within an aggregate boundary', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `account-${Date.now()}` as EventStreamId;

        // Initialize account with balance
        const initCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'Account',
          },
          commandName: 'OpenAccount',
          payload: { initialBalance: 100 },
        };

        await Effect.runPromise(context.processCommand(initCommand));

        // Try to withdraw more than balance (should fail based on aggregate rules)
        const overdraftCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 1 as EventNumber },
            name: 'Account',
          },
          commandName: 'Withdraw',
          payload: { amount: 150 },
        };

        const overdraftResult = await Effect.runPromise(context.processCommand(overdraftCommand));
        expect(Either.isLeft(overdraftResult)).toBe(true);
        if (Either.isLeft(overdraftResult)) {
          expect(overdraftResult.left.message).toContain('insufficient');
        }

        // Valid withdrawal should succeed
        const validWithdraw: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 1 as EventNumber },
            name: 'Account',
          },
          commandName: 'Withdraw',
          payload: { amount: 50 },
        };

        const validResult = await Effect.runPromise(context.processCommand(validWithdraw));
        expect(Either.isRight(validResult)).toBe(true);
      });

      it('MUST ensure events are idempotent when replayed', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `idempotent-${Date.now()}` as EventStreamId;

        // Create a command with an idempotency key
        const idempotencyKey = `key-${Date.now()}`;
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
        const successCount = results.filter(Either.isRight).length;
        expect(successCount).toBe(3); // All return same success

        // Only one event should be created
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });

      it('MUST handle aggregate creation correctly', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `new-aggregate-${Date.now()}` as EventStreamId;

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
      });
    });

    describe('Command Processing', () => {
      it('MUST atomically process commands (all-or-nothing)', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `atomic-${Date.now()}` as EventStreamId;

        // Command that would produce multiple events
        const multiEventCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'Order',
          },
          commandName: 'PlaceOrder',
          payload: {
            items: ['item1', 'item2', 'item3'],
            // This might trigger: OrderPlaced, InventoryReserved, PaymentRequested
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

      it('MUST provide exactly-once command processing semantics', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `exactly-once-${Date.now()}` as EventStreamId;
        const commandId = `cmd-${Date.now()}`;

        // Command with unique ID
        const command: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'UniqueCommand',
          payload: { value: 'test' },
          metadata: { commandId },
        };

        // Send command multiple times (simulating retries)
        const attempts = 5;
        const results = await Effect.runPromise(
          Effect.all(Array.from({ length: attempts }, () => context.processCommand(command)))
        );

        // All attempts should return the same result
        const firstResult = results[0];
        if (firstResult !== undefined) {
          results.forEach((result) => {
            expect(result).toEqual(firstResult);
          });
        }

        // Only one event should be created
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(1);
      });

      it('MUST reject commands that violate business invariants', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `invariant-${Date.now()}` as EventStreamId;

        // Create aggregate with constraints
        const createCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'BoundedList',
          },
          commandName: 'CreateList',
          payload: { maxSize: 3 },
        };

        await Effect.runPromise(context.processCommand(createCommand));

        // Add items up to the limit
        for (let i = 0; i < 3; i++) {
          const addCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: (i + 1) as EventNumber },
              name: 'BoundedList',
            },
            commandName: 'AddItem',
            payload: { item: `item${i}` },
          };
          const result = await Effect.runPromise(context.processCommand(addCommand));
          expect(Either.isRight(result)).toBe(true);
        }

        // Try to exceed the limit (should fail)
        const exceedCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 4 as EventNumber },
            name: 'BoundedList',
          },
          commandName: 'AddItem',
          payload: { item: 'tooMany' },
        };

        const exceedResult = await Effect.runPromise(context.processCommand(exceedCommand));
        expect(Either.isLeft(exceedResult)).toBe(true);
        if (Either.isLeft(exceedResult)) {
          expect(exceedResult.left.message).toContain('limit');
        }
      });
    });

    describe('Event Stream Guarantees', () => {
      it('MUST guarantee no gaps in event numbers within a stream', async () => {
        const context = await Effect.runPromise(setup());
        const streamId = `no-gaps-${Date.now()}` as EventStreamId;

        // Create 10 events
        for (let i = 0; i < 10; i++) {
          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: i as EventNumber },
              name: 'TestAggregate',
            },
            commandName: 'AppendEvent',
            payload: { index: i },
          };
          await Effect.runPromise(context.processCommand(command));
        }

        // Verify continuous sequence
        const lastEventNumber = await Effect.runPromise(context.getLastEventNumber(streamId));
        expect(lastEventNumber).toBe(10);

        // Event numbers should be 1, 2, 3, ..., 10 with no gaps
        const eventCount = await Effect.runPromise(context.getEventCount(streamId));
        expect(eventCount).toBe(10);
      });

      it('MUST ensure stream isolation (no cross-stream contamination)', async () => {
        const context = await Effect.runPromise(setup());
        const streamA = `stream-a-${Date.now()}` as EventStreamId;
        const streamB = `stream-b-${Date.now()}` as EventStreamId;

        // Add events to stream A
        const commandA: AggregateCommand = {
          aggregate: {
            position: { streamId: streamA, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'TestCommand',
          payload: { stream: 'A' },
        };

        // Add events to stream B
        const commandB: AggregateCommand = {
          aggregate: {
            position: { streamId: streamB, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'TestCommand',
          payload: { stream: 'B' },
        };

        await Effect.runPromise(context.processCommand(commandA));
        await Effect.runPromise(context.processCommand(commandB));

        // Each stream should have exactly 1 event
        const countA = await Effect.runPromise(context.getEventCount(streamA));
        const countB = await Effect.runPromise(context.getEventCount(streamB));

        expect(countA).toBe(1);
        expect(countB).toBe(1);

        // Event numbers should be independent
        const lastA = await Effect.runPromise(context.getLastEventNumber(streamA));
        const lastB = await Effect.runPromise(context.getLastEventNumber(streamB));

        expect(lastA).toBe(1);
        expect(lastB).toBe(1);
      });
    });
  });
}
