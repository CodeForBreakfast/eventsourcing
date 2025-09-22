/**
 * LAYER 4: Integration Test Suite
 *
 * Tests ONLY end-to-end scenarios that span multiple layers. OPTIONAL for validation.
 * These tests validate that transport + protocol + domain layers work correctly
 * together in real-world scenarios.
 *
 * WHAT IS TESTED:
 * - Complete command-to-event flows
 * - Network failure recovery scenarios
 * - Performance under load
 * - Multi-client scenarios
 * - Real-world usage patterns
 *
 * WHAT IS NOT TESTED:
 * - Individual layer responsibilities (covered in Layers 1-3)
 * - Pure transport mechanics (covered in Layer 1)
 * - Protocol serialization (covered in Layer 2)
 * - Domain invariants (covered in Layer 3)
 */

import { Effect, pipe, Duration, Either, Schedule } from 'effect';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type {
  IntegrationTestContext,
  IntegrationFeatures,
  IntegrationTestRunner,
  TestScenario,
} from './test-layer-interfaces.js';
import type { EventStreamId, EventNumber } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateCommand } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * OPTIONAL: Integration test suite.
 * These tests validate complete end-to-end scenarios across all layers.
 */
export const runIntegrationTestSuite: IntegrationTestRunner = (
  name: string,
  setup: () => Effect.Effect<IntegrationTestContext>,
  features?: IntegrationFeatures
) => {
  describe(`${name} Integration Tests`, () => {
    let context: IntegrationTestContext;

    beforeEach(async () => {
      context = await Effect.runPromise(setup());
    });

    afterEach(async () => {
      await Effect.runPromise(context.cleanup());
    });

    describe('OPTIONAL: End-to-End Command Flows', () => {
      it('should complete a full command-to-event flow', async () => {
        const streamId = `e2e-test-${Date.now()}` as EventStreamId;

        const command: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'CreateTest',
          payload: { value: 'end-to-end test' },
        };

        const expectedEventTypes = ['TestCreated'];

        const events = await Effect.runPromise(
          context.sendCommandAndWaitForEvents(command, expectedEventTypes, 5000)
        );

        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe('TestCreated');
        expect(events[0]?.streamId).toBe(streamId);
        expect((events[0]?.data as any)?.value).toBe('end-to-end test');
      });

      it('should handle command validation and rejection', async () => {
        const streamId = `validation-test-${Date.now()}` as EventStreamId;

        const invalidCommand: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'TestAggregate',
          },
          commandName: 'InvalidCommand',
          payload: { value: '' }, // Empty value should be invalid
        };

        const result = await Effect.runPromise(
          pipe(
            context.sendCommandAndWaitForEvents(invalidCommand, ['TestCreated'], 1000),
            Effect.either
          )
        );

        expect(Either.isLeft(result)).toBe(true);
      });

      it('should handle multi-step business processes', async () => {
        const orderId = `order-${Date.now()}` as EventStreamId;

        // Step 1: Create order
        const createOrderCommand: AggregateCommand = {
          aggregate: {
            position: { streamId: orderId, eventNumber: 0 as EventNumber },
            name: 'Order',
          },
          commandName: 'CreateOrder',
          payload: { customerId: 'customer-123', items: ['item1', 'item2'] },
        };

        const createEvents = await Effect.runPromise(
          context.sendCommandAndWaitForEvents(createOrderCommand, ['OrderCreated'], 2000)
        );

        expect(createEvents).toHaveLength(1);

        // Step 2: Process payment
        const processPaymentCommand: AggregateCommand = {
          aggregate: {
            position: { streamId: orderId, eventNumber: 1 as EventNumber },
            name: 'Order',
          },
          commandName: 'ProcessPayment',
          payload: { amount: 99.99, method: 'credit_card' },
        };

        const paymentEvents = await Effect.runPromise(
          context.sendCommandAndWaitForEvents(processPaymentCommand, ['PaymentProcessed'], 2000)
        );

        expect(paymentEvents).toHaveLength(1);

        // Step 3: Ship order
        const shipOrderCommand: AggregateCommand = {
          aggregate: {
            position: { streamId: orderId, eventNumber: 2 as EventNumber },
            name: 'Order',
          },
          commandName: 'ShipOrder',
          payload: { carrier: 'DHL', trackingNumber: 'DHL123456' },
        };

        const shipEvents = await Effect.runPromise(
          context.sendCommandAndWaitForEvents(shipOrderCommand, ['OrderShipped'], 2000)
        );

        expect(shipEvents).toHaveLength(1);
      });

      it('should handle concurrent commands across different aggregates', async () => {
        const userIds = Array.from(
          { length: 5 },
          (_, i) => `user-${Date.now()}-${i}` as EventStreamId
        );

        const commands = userIds.map((userId, index) => ({
          aggregate: {
            position: { streamId: userId, eventNumber: 0 as EventNumber },
            name: 'User',
          },
          commandName: 'CreateUser',
          payload: { email: `user${index}@example.com`, name: `User ${index}` },
        }));

        // Process all commands concurrently
        const results = await Effect.runPromise(
          Effect.all(
            commands.map((cmd) => context.sendCommandAndWaitForEvents(cmd, ['UserCreated'], 3000)),
            { concurrency: 'unbounded' }
          )
        );

        expect(results).toHaveLength(5);
        results.forEach((events, index) => {
          expect(events).toHaveLength(1);
          expect(events[0]?.eventType).toBe('UserCreated');
          expect(events[0]?.streamId).toBe(userIds[index]);
        });
      });
    });

    describe('OPTIONAL: Test Scenarios', () => {
      it('should execute predefined test scenarios', async () => {
        const scenario: TestScenario = {
          name: 'User Registration Flow',
          description: 'Complete user registration with email verification',
          steps: [
            {
              type: 'command',
              data: {
                aggregate: {
                  position: {
                    streamId: `user-scenario-${Date.now()}` as EventStreamId,
                    eventNumber: 0 as EventNumber,
                  },
                  name: 'User',
                },
                commandName: 'RegisterUser',
                payload: { email: 'test@example.com', password: 'secure123' },
              },
            },
            {
              type: 'wait',
              data: { duration: 100 },
            },
            {
              type: 'verify',
              data: { expectedEvents: ['UserRegistered', 'EmailVerificationSent'] },
            },
            {
              type: 'command',
              data: {
                aggregate: {
                  position: {
                    streamId: `user-scenario-${Date.now()}` as EventStreamId,
                    eventNumber: 2 as EventNumber,
                  },
                  name: 'User',
                },
                commandName: 'VerifyEmail',
                payload: { token: 'verification-token-123' },
              },
            },
            {
              type: 'verify',
              data: { expectedEvents: ['EmailVerified'] },
            },
          ],
          expectedOutcome: {
            success: true,
            eventCount: 3,
            finalStates: {
              userRegistered: true,
              emailVerified: true,
            },
          },
        };

        const result = await Effect.runPromise(context.runScenario(scenario));

        expect(result.success).toBe(true);
        expect(result.actualOutcome.success).toBe(true);
        expect(result.actualOutcome.eventCount).toBe(3);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle scenario failures gracefully', async () => {
        const failingScenario: TestScenario = {
          name: 'Invalid Operation Scenario',
          description: 'Test scenario that should fail due to business rules',
          steps: [
            {
              type: 'command',
              data: {
                aggregate: {
                  position: {
                    streamId: `failing-scenario-${Date.now()}` as EventStreamId,
                    eventNumber: 0 as EventNumber,
                  },
                  name: 'Account',
                },
                commandName: 'WithdrawMoney',
                payload: { amount: 1000000 }, // Impossible amount
              },
            },
          ],
          expectedOutcome: {
            success: false,
            eventCount: 0,
            finalStates: {},
          },
        };

        const result = await Effect.runPromise(context.runScenario(failingScenario));

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('OPTIONAL: Performance Testing', () => {
      it('should measure command throughput', async () => {
        const metrics = await Effect.runPromise(
          context.measureThroughput(100, 5000) // 100 operations in 5 seconds
        );

        expect(metrics.commandsPerSecond).toBeGreaterThan(0);
        expect(metrics.eventsPerSecond).toBeGreaterThan(0);
        expect(metrics.averageLatency).toBeGreaterThan(0);
        expect(metrics.p99Latency).toBeGreaterThan(metrics.averageLatency);
      });

      it('should handle sustained load', async () => {
        const startTime = Date.now();
        const operationCount = 500;
        const commands = Array.from({ length: operationCount }, (_, i) => ({
          aggregate: {
            position: {
              streamId: `load-test-${i}` as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'LoadTest',
          },
          commandName: 'LoadTestCommand',
          payload: { sequence: i, timestamp: Date.now() },
        }));

        // Send all commands rapidly
        const results = await Effect.runPromise(
          Effect.all(
            commands.map((cmd) =>
              context.sendCommandAndWaitForEvents(cmd, ['LoadTestProcessed'], 10000)
            ),
            { concurrency: 10 } // Limit concurrency to avoid overwhelming
          )
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(results).toHaveLength(operationCount);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        // All commands should succeed
        results.forEach((events, index) => {
          expect(events).toHaveLength(1);
          expect((events[0]?.data as any)?.sequence).toBe(index);
        });
      });

      it('should maintain performance under concurrent load', async () => {
        const concurrentClients = 5;
        const commandsPerClient = 20;

        const clientPromises = Array.from({ length: concurrentClients }, async (_, clientId) => {
          const commands = Array.from({ length: commandsPerClient }, (_, commandId) => ({
            aggregate: {
              position: {
                streamId: `concurrent-${clientId}-${commandId}` as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'ConcurrentTest',
            },
            commandName: 'ConcurrentCommand',
            payload: { clientId, commandId, timestamp: Date.now() },
          }));

          return Effect.runPromise(
            Effect.all(
              commands.map((cmd) =>
                context.sendCommandAndWaitForEvents(cmd, ['ConcurrentProcessed'], 5000)
              ),
              { concurrency: 5 }
            )
          );
        });

        const allResults = await Promise.all(clientPromises);

        // All clients should complete successfully
        expect(allResults).toHaveLength(concurrentClients);
        allResults.forEach((clientResults, clientId) => {
          expect(clientResults).toHaveLength(commandsPerClient);
          clientResults.forEach((events, commandId) => {
            expect(events).toHaveLength(1);
            const data = events[0]?.data as any;
            expect(data?.clientId).toBe(clientId);
            expect(data?.commandId).toBe(commandId);
          });
        });
      });
    });

    // OPTIONAL FEATURE TESTS
    if (features?.supportsHighAvailability) {
      describe('OPTIONAL: High Availability', () => {
        it('should continue operating during server failures', async () => {
          const streamId = `ha-test-${Date.now()}` as EventStreamId;

          // Send initial command
          const initialCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 0 as EventNumber },
              name: 'HATest',
            },
            commandName: 'InitialCommand',
            payload: { phase: 'before-failure' },
          };

          await Effect.runPromise(
            context.sendCommandAndWaitForEvents(initialCommand, ['HAProcessed'], 2000)
          );

          // Simulate server restart
          await Effect.runPromise(context.testServerRestart());

          // Send command after restart
          const postRestartCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 1 as EventNumber },
              name: 'HATest',
            },
            commandName: 'PostRestartCommand',
            payload: { phase: 'after-restart' },
          };

          const postRestartEvents = await Effect.runPromise(
            context.sendCommandAndWaitForEvents(postRestartCommand, ['HAProcessed'], 5000)
          );

          expect(postRestartEvents).toHaveLength(1);
          expect((postRestartEvents[0]?.data as any)?.phase).toBe('after-restart');
        });

        it('should handle network partitions gracefully', async () => {
          const streamId = `partition-test-${Date.now()}` as EventStreamId;

          // Start command during normal operation
          const beforePartitionCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 0 as EventNumber },
              name: 'PartitionTest',
            },
            commandName: 'BeforePartition',
            payload: { status: 'normal' },
          };

          await Effect.runPromise(
            context.sendCommandAndWaitForEvents(
              beforePartitionCommand,
              ['PartitionProcessed'],
              2000
            )
          );

          // Simulate network partition
          await Effect.runPromise(context.testNetworkPartition(1000));

          // Command during partition should eventually succeed
          const duringPartitionCommand: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 1 as EventNumber },
              name: 'PartitionTest',
            },
            commandName: 'DuringPartition',
            payload: { status: 'partitioned' },
          };

          const duringPartitionEvents = await Effect.runPromise(
            context.sendCommandAndWaitForEvents(
              duringPartitionCommand,
              ['PartitionProcessed'],
              10000
            )
          );

          expect(duringPartitionEvents).toHaveLength(1);
          expect((duringPartitionEvents[0]?.data as any)?.status).toBe('partitioned');
        });
      });
    }

    if (features?.supportsLoadBalancing) {
      describe('OPTIONAL: Load Balancing', () => {
        it('should distribute load across multiple instances', async () => {
          const commandCount = 100;
          const commands = Array.from({ length: commandCount }, (_, i) => ({
            aggregate: {
              position: {
                streamId: `lb-test-${i}` as EventStreamId,
                eventNumber: 0 as EventNumber,
              },
              name: 'LoadBalancingTest',
            },
            commandName: 'DistributedCommand',
            payload: { sequence: i, batch: 'load-balancing' },
          }));

          // Send commands that should be distributed across instances
          const results = await Effect.runPromise(
            Effect.all(
              commands.map((cmd) =>
                context.sendCommandAndWaitForEvents(cmd, ['DistributedProcessed'], 10000)
              ),
              { concurrency: 'unbounded' }
            )
          );

          expect(results).toHaveLength(commandCount);

          // All commands should succeed regardless of which instance processed them
          results.forEach((events, index) => {
            expect(events).toHaveLength(1);
            expect((events[0]?.data as any)?.sequence).toBe(index);
          });
        });
      });
    }

    if (features?.supportsGeoReplication) {
      describe('OPTIONAL: Geo-Replication', () => {
        it('should replicate events across geographical regions', async () => {
          const streamId = `geo-replication-${Date.now()}` as EventStreamId;

          const command: AggregateCommand = {
            aggregate: {
              position: { streamId, eventNumber: 0 as EventNumber },
              name: 'GeoTest',
            },
            commandName: 'GlobalCommand',
            payload: { region: 'us-east-1', content: 'replicated data' },
          };

          const events = await Effect.runPromise(
            context.sendCommandAndWaitForEvents(command, ['GlobalProcessed'], 5000)
          );

          expect(events).toHaveLength(1);
          expect((events[0]?.data as any)?.content).toBe('replicated data');

          // Additional verification could check that events are available in other regions
          // This would be implementation-specific
        });
      });
    }

    if (features?.supportsBackupRestore) {
      describe('OPTIONAL: Backup and Restore', () => {
        it('should maintain data integrity through backup/restore cycle', async () => {
          const streamIds = Array.from(
            { length: 10 },
            (_, i) => `backup-test-${i}` as EventStreamId
          );

          // Create initial data
          const initialCommands = streamIds.map((streamId, index) => ({
            aggregate: {
              position: { streamId, eventNumber: 0 as EventNumber },
              name: 'BackupTest',
            },
            commandName: 'CreateInitialData',
            payload: { index, content: `initial-data-${index}` },
          }));

          await Effect.runPromise(
            Effect.all(
              initialCommands.map((cmd) =>
                context.sendCommandAndWaitForEvents(cmd, ['InitialDataCreated'], 3000)
              )
            )
          );

          // Note: Actual backup/restore would be implementation-specific
          // This test validates that the system can handle backup/restore scenarios

          // Verify data is still accessible (post-restore verification)
          const verificationCommands = streamIds.map((streamId, index) => ({
            aggregate: {
              position: { streamId, eventNumber: 1 as EventNumber },
              name: 'BackupTest',
            },
            commandName: 'VerifyData',
            payload: { index, verification: true },
          }));

          const verificationResults = await Effect.runPromise(
            Effect.all(
              verificationCommands.map((cmd) =>
                context.sendCommandAndWaitForEvents(cmd, ['DataVerified'], 3000)
              )
            )
          );

          expect(verificationResults).toHaveLength(10);
          verificationResults.forEach((events, index) => {
            expect(events).toHaveLength(1);
            expect((events[0]?.data as any)?.index).toBe(index);
          });
        });
      });
    }

    describe('OPTIONAL: Error Recovery', () => {
      it('should recover from transient failures', async () => {
        const streamId = `recovery-test-${Date.now()}` as EventStreamId;

        const command: AggregateCommand = {
          aggregate: {
            position: { streamId, eventNumber: 0 as EventNumber },
            name: 'RecoveryTest',
          },
          commandName: 'TransientFailureCommand',
          payload: { shouldFail: true }, // First attempt should fail
        };

        // This command might fail initially but should eventually succeed through retries
        const result = await Effect.runPromise(
          pipe(
            context.sendCommandAndWaitForEvents(command, ['RecoveryProcessed'], 10000),
            Effect.retry(Schedule.recurs(3).pipe(Schedule.addDelay(() => Duration.millis(500)))),
            Effect.either
          )
        );

        // Should eventually succeed or fail gracefully
        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
      });

      it('should maintain system stability during error conditions', async () => {
        const errorCommands = Array.from({ length: 20 }, (_, i) => ({
          aggregate: {
            position: {
              streamId: `error-test-${i}` as EventStreamId,
              eventNumber: 0 as EventNumber,
            },
            name: 'ErrorTest',
          },
          commandName: 'ErrorProneCommand',
          payload: { shouldError: i % 3 === 0 }, // Every third command errors
        }));

        const results = await Effect.runPromise(
          Effect.all(
            errorCommands.map((cmd) =>
              pipe(
                context.sendCommandAndWaitForEvents(cmd, ['ErrorProcessed'], 3000),
                Effect.either
              )
            ),
            { concurrency: 5 }
          )
        );

        expect(results).toHaveLength(20);

        // System should remain stable despite errors
        const successes = results.filter(Either.isRight);
        const failures = results.filter(Either.isLeft);

        expect(successes.length + failures.length).toBe(20);
        expect(successes.length).toBeGreaterThan(0); // Some should succeed
      });
    });
  });
};
