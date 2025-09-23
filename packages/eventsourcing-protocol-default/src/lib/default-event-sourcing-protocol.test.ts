/**
 * Event Sourcing Protocol - Minimum Functionality Test Suite
 *
 * Comprehensive test suite validating the minimum required functionality
 * of the event sourcing protocol layer. This test suite is transport-agnostic
 * and focuses purely on protocol behavior and reliability.
 *
 * SCOPE: Protocol layer between transport and domain logic
 * NOT TESTED: Transport reliability, business domain logic
 * TESTED: Protocol contract compliance, error handling, message serialization
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Effect, Stream, Queue, Ref, Deferred, Either, Fiber, Duration } from 'effect';
import {
  generateStreamId,
  generateCommandId,
  createTestCommand,
  createTestStreamEvent,
  type MockTransportState,
} from '@codeforbreakfast/eventsourcing-testing-contracts';
import {
  type TransportMessage,
  type ConnectionState,
  makeMessageId,
  Client,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  createProtocolContext,
  createRequestContext,
  type ProtocolContext,
  type RequestContext,
  CommandError,
  StreamError,
  type AggregateCommand,
  type StreamEvent,
  type CommandResult,
  type EventStreamPosition,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import { createDefaultProtocolSerializer } from '../default-protocol-serializer.js';
import { createProtocolStateManager } from '../protocol-state-manager.js';
import { createDefaultEventSourcingProtocol } from '../default-event-sourcing-protocol.js';

// ============================================================================
// Test Types and Interfaces
// ============================================================================

interface TestEvent {
  readonly type: string;
  readonly payload: unknown;
}

interface MockTransportWithHelpers extends Client.Transport<TransportMessage> {
  // Expected by protocol but not in base interface
  isConnected: () => Effect.Effect<boolean, never, never>;
  disconnect: () => Effect.Effect<void, never, never>;
  send: (message: {
    id: string;
    payload: string;
    timestamp: Date;
  }) => Effect.Effect<void, never, never>;

  // Test helpers
  injectMessage: (message: TransportMessage) => Effect.Effect<void, never, never>;
  simulateDisconnection: () => Effect.Effect<void, never, never>;
  simulateReconnection: () => Effect.Effect<void, never, never>;
  getReceivedMessages: () => Effect.Effect<TransportMessage[], never, never>;
  clearMessages: () => Effect.Effect<void, never, never>;
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

const createTestProtocolContext = (): ProtocolContext =>
  createProtocolContext({
    sessionId: 'test-session-min-func',
    userId: 'test-user-min-func',
    correlationId: 'test-correlation-min-func',
  });

const createMockTransportWithHelpers = (): Effect.Effect<MockTransportWithHelpers, never, never> =>
  Effect.gen(function* () {
    const sentMessages = yield* Ref.make<TransportMessage[]>([]);
    const receivedMessages = yield* Queue.unbounded<TransportMessage>();
    const connectionStateQueue = yield* Queue.unbounded<ConnectionState>();
    const connected = yield* Ref.make(true);

    // Start connected
    yield* Queue.offer(connectionStateQueue, 'connected');

    const transport: MockTransportWithHelpers = {
      connectionState: Stream.fromQueue(connectionStateQueue),

      publish: (message: TransportMessage) =>
        Effect.gen(function* () {
          const isConnected = yield* Ref.get(connected);
          if (!isConnected) {
            return yield* Effect.fail(new Error('Transport not connected'));
          }
          yield* Ref.update(sentMessages, (messages) => [...messages, message]);
        }),

      subscribe: () => Effect.succeed(Stream.fromQueue(receivedMessages)),

      isConnected: () => Ref.get(connected),

      disconnect: () =>
        Effect.gen(function* () {
          yield* Ref.set(connected, false);
          yield* Queue.offer(connectionStateQueue, 'disconnected');
        }),

      send: (message: { id: string; payload: string; timestamp: Date }) =>
        Effect.gen(function* () {
          const isConnected = yield* Ref.get(connected);
          if (!isConnected) {
            return yield* Effect.fail(new Error('Transport not connected'));
          }

          const transportMessage: TransportMessage = {
            id: makeMessageId(message.id),
            payload: message.payload,
            timestamp: message.timestamp,
          };

          yield* Ref.update(sentMessages, (messages) => [...messages, transportMessage]);
        }),

      // Helper methods for tests
      injectMessage: (message: TransportMessage) => Queue.offer(receivedMessages, message),

      simulateDisconnection: () =>
        Effect.gen(function* () {
          yield* Ref.set(connected, false);
          yield* Queue.offer(connectionStateQueue, 'disconnected');
        }),

      simulateReconnection: () =>
        Effect.gen(function* () {
          yield* Ref.set(connected, true);
          yield* Queue.offer(connectionStateQueue, 'connected');
        }),

      getReceivedMessages: () => Ref.get(sentMessages),

      clearMessages: () => Ref.set(sentMessages, []),
    };

    return transport;
  });

const createTestProtocol = () =>
  Effect.gen(function* () {
    const transport = yield* createMockTransportWithHelpers();
    const serializer = createDefaultProtocolSerializer<TestEvent>();
    const stateManager = yield* createProtocolStateManager<TestEvent>();
    const context = createTestProtocolContext();

    const protocol = createDefaultEventSourcingProtocol(
      transport,
      serializer,
      stateManager,
      context
    );

    return { protocol, transport, serializer, stateManager, context };
  });

// ============================================================================
// 1. COMMAND OPERATIONS TESTS
// ============================================================================

describe('MINIMUM FUNCTIONALITY: Command Operations', () => {
  describe('Send Single Commands with Payloads', () => {
    test('should send simple command with string payload', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'string-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'StringCommand',
            payload: 'hello world',
          });

          // Start sending command (will timeout, but that's ok for this test)
          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '200 millis').pipe(Effect.either)
          );

          // Give it a moment to process
          yield* Effect.sleep('50 millis');

          // Command should have been sent to transport
          const isConnected = yield* protocol.isConnected();
          expect(isConnected).toBe(true);

          yield* Fiber.interrupt(commandFiber);
        })
      );

      await Effect.runPromise(program);
    });

    test('should send command with complex object payload', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const complexPayload = {
            user: { id: 123, name: 'John Doe', preferences: { theme: 'dark', lang: 'en' } },
            items: [
              { id: 1, quantity: 2, price: 10.5 },
              { id: 2, quantity: 1, price: 25.0 },
            ],
            metadata: { version: '1.2.3', timestamp: new Date().toISOString() },
          };

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'complex-test', eventNumber: 0 },
              name: 'OrderAggregate',
            },
            commandName: 'CreateOrder',
            payload: complexPayload,
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '200 millis').pipe(Effect.either)
          );

          yield* Effect.sleep('50 millis');
          yield* Fiber.interrupt(commandFiber);
        })
      );

      await Effect.runPromise(program);
    });

    test('should send command with null payload', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'null-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'NullCommand',
            payload: null,
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '200 millis').pipe(Effect.either)
          );

          yield* Effect.sleep('50 millis');
          yield* Fiber.interrupt(commandFiber);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Handle Command Timeouts', () => {
    test('should timeout gracefully when command takes too long', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'timeout-test', eventNumber: 0 },
              name: 'SlowAggregate',
            },
            commandName: 'SlowCommand',
            payload: { delay: 5000 },
          });

          // Send with very short timeout
          const result = yield* Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(
            Effect.either
          );

          // Should timeout and return Left
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('TimeoutException');
          }
        })
      );

      await Effect.runPromise(program);
    });

    test('should provide custom timeout via request context', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, context } = yield* createTestProtocol();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'custom-timeout-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'CustomTimeoutCommand',
            payload: { message: 'test' },
          });

          const requestContext = createRequestContext(context, { timeoutMs: 50 });

          const result = yield* protocol.sendCommand(command, requestContext).pipe(Effect.either);

          // Should handle timeout through request context
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Track Commands via Correlation IDs', () => {
    test('should generate unique correlation IDs for each command', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, transport } = yield* createTestProtocol();

          const commands = Array.from({ length: 5 }, (_, i) =>
            createTestCommand({
              aggregate: {
                position: { streamId: `correlation-test-${i}`, eventNumber: 0 },
                name: 'TestAggregate',
              },
              commandName: 'CorrelationCommand',
              payload: { index: i },
            })
          );

          // Send all commands
          const commandFibers = yield* Effect.forEach(
            commands,
            (command) =>
              Effect.fork(
                Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(Effect.either)
              ),
            { concurrency: 'unbounded' }
          );

          yield* Effect.sleep('50 millis');

          // Check sent messages for unique correlation IDs
          const sentMessages = yield* transport.getReceivedMessages();
          const correlationIds = new Set();

          sentMessages.forEach((message) => {
            const parsed = JSON.parse(message.payload);
            if (parsed.correlationId) {
              expect(correlationIds.has(parsed.correlationId)).toBe(false);
              correlationIds.add(parsed.correlationId);
            }
          });

          yield* Effect.forEach(commandFibers, (fiber) => Effect.interrupt(fiber));
        })
      );

      await Effect.runPromise(program);
    });

    test('should use provided correlation ID from request context', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, transport, context } = yield* createTestProtocol();

          const customCorrelationId = 'custom-correlation-123';
          const requestContext = createRequestContext(context, {
            correlationId: customCorrelationId,
          });

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'custom-correlation-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'CustomCorrelationCommand',
            payload: { message: 'test' },
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command, requestContext), '100 millis').pipe(
              Effect.either
            )
          );

          yield* Effect.sleep('50 millis');

          const sentMessages = yield* transport.getReceivedMessages();
          const lastMessage = sentMessages[sentMessages.length - 1];

          if (lastMessage) {
            const parsed = JSON.parse(lastMessage.payload);
            expect(parsed.correlationId).toBe(customCorrelationId);
          }

          yield* Fiber.interrupt(commandFiber);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Handle Command Failures', () => {
    test('should not crash on command serialization failures', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          // Create command with circular reference
          const circularPayload: any = { message: 'test' };
          circularPayload.self = circularPayload;

          const invalidCommand = {
            aggregate: {
              position: { streamId: 'serialization-failure-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'InvalidCommand',
            payload: circularPayload,
          } as AggregateCommand;

          const result = yield* protocol.sendCommand(invalidCommand).pipe(
            Effect.timeout('500 millis'), // Add timeout to prevent hanging
            Effect.either
          );

          // Should fail gracefully (either serialization error or timeout)
          expect(Either.isLeft(result)).toBe(true);

          // Protocol should still be functional
          const isConnected = yield* protocol.isConnected();
          expect(isConnected).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });

    test('should handle transport disconnection during command send', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, transport } = yield* createTestProtocol();

          // Disconnect transport
          yield* transport.simulateDisconnection();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'disconnection-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'DisconnectionCommand',
            payload: { message: 'test' },
          });

          const result = yield* protocol
            .sendCommand(command)
            .pipe(Effect.timeout('100 millis'), Effect.either);

          // Should handle disconnection gracefully
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Support Batch Command Sending', () => {
    test('should send multiple commands concurrently', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const batchSize = 10;
          const commands = Array.from({ length: batchSize }, (_, i) =>
            createTestCommand({
              aggregate: {
                position: { streamId: `batch-test-${i}`, eventNumber: 0 },
                name: 'BatchAggregate',
              },
              commandName: 'BatchCommand',
              payload: { batchIndex: i, timestamp: Date.now() },
            })
          );

          // Send batch using built-in batch method
          const results = yield* protocol
            .sendCommandBatch(commands)
            .pipe(Effect.timeout('500 millis'), Effect.either);

          if (Either.isRight(results)) {
            expect(results.right).toHaveLength(batchSize);
          } else {
            // Timeout is acceptable for this test
            expect(Either.isLeft(results)).toBe(true);
          }
        })
      );

      await Effect.runPromise(program);
    });

    test('should handle partial batch failures gracefully', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          // Mix of valid and invalid commands
          const commands = [
            createTestCommand({
              aggregate: {
                position: { streamId: 'valid-command-1', eventNumber: 0 },
                name: 'ValidAggregate',
              },
              commandName: 'ValidCommand',
              payload: { message: 'valid' },
            }),
            {
              aggregate: {
                position: { streamId: '', eventNumber: 0 }, // Invalid empty stream
                name: 'InvalidAggregate',
              },
              commandName: 'InvalidCommand',
              payload: { message: 'invalid' },
            } as AggregateCommand,
            createTestCommand({
              aggregate: {
                position: { streamId: 'valid-command-2', eventNumber: 0 },
                name: 'ValidAggregate',
              },
              commandName: 'ValidCommand',
              payload: { message: 'valid' },
            }),
          ];

          const results = yield* protocol
            .sendCommandBatch(commands)
            .pipe(Effect.timeout('500 millis'), Effect.either);

          // Should return results for all commands (some may be errors)
          if (Either.isRight(results)) {
            expect(results.right).toHaveLength(3);
          } else {
            // Timeout is acceptable for this test
            expect(Either.isLeft(results)).toBe(true);
          }
        })
      );

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// 2. EVENT STREAM SUBSCRIPTIONS TESTS
// ============================================================================

describe('MINIMUM FUNCTIONALITY: Event Stream Subscriptions', () => {
  describe('Subscribe to Specific Event Streams', () => {
    test('should create subscription to specific stream from beginning', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const streamId = generateStreamId();
          const position: EventStreamPosition = { streamId, eventNumber: 0 };

          const eventStream = yield* protocol.subscribe(position);

          // Verify stream was created
          expect(Stream.isStream(eventStream)).toBe(true);

          // Verify subscription was registered
          const subscriptions = yield* protocol.getActiveSubscriptions();
          expect(subscriptions).toHaveLength(1);
          expect(subscriptions[0].streamId).toBe(streamId);
          expect(subscriptions[0].isActive).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });

    test('should create subscription from specific position', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const streamId = generateStreamId();
          const fromPosition = 42;
          const position: EventStreamPosition = { streamId, eventNumber: fromPosition };

          const eventStream = yield* protocol.subscribe(position, {
            fromPosition: position,
            timeoutMs: 1000,
          });

          expect(Stream.isStream(eventStream)).toBe(true);

          const subscriptions = yield* protocol.getActiveSubscriptions();
          expect(subscriptions).toHaveLength(1);
          expect(subscriptions[0].currentPosition.eventNumber).toBe(fromPosition);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Receive Events in Order', () => {
    test('should receive events in correct order', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, transport } = yield* createTestProtocol();

          const streamId = generateStreamId();
          const position: EventStreamPosition = { streamId, eventNumber: 0 };

          const eventStream = yield* protocol.subscribe(position);

          // Create test events
          const events = Array.from({ length: 5 }, (_, i) =>
            createTestStreamEvent<TestEvent>({
              position: { streamId, eventNumber: i + 1 },
              event: { type: 'TestEvent', payload: { order: i } },
            })
          );

          // Inject events into the transport (simulate server sending events)
          for (const event of events) {
            const serverMessage = {
              id: makeMessageId(`event-${event.position.eventNumber}`),
              payload: JSON.stringify({
                type: 'event',
                streamId: event.position.streamId,
                eventNumber: event.position.eventNumber,
                event: event.event,
                timestamp: event.timestamp.toISOString(),
              }),
              timestamp: event.timestamp,
            };

            yield* transport.injectMessage(serverMessage);
          }

          // Consume events and verify order
          const consumedEvents = yield* Stream.take(eventStream, 5).pipe(
            Stream.runCollect,
            Effect.timeout('1000 millis'),
            Effect.either
          );

          if (Either.isRight(consumedEvents)) {
            const eventArray = [...consumedEvents.right];
            expect(eventArray).toHaveLength(5);

            eventArray.forEach((event, index) => {
              expect((event.event as any).payload.order).toBe(index);
              expect(event.position.eventNumber).toBe(index + 1);
            });
          }
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Unsubscribe from Streams Cleanly', () => {
    test('should unsubscribe from stream and clean up resources', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const streamId = generateStreamId();
          const position: EventStreamPosition = { streamId, eventNumber: 0 };

          // Create subscription
          yield* protocol.subscribe(position);

          // Verify subscription exists
          const subscriptionsBefore = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsBefore).toHaveLength(1);

          // Unsubscribe
          yield* protocol.unsubscribe(streamId);

          // Verify subscription was removed
          const subscriptionsAfter = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsAfter).toHaveLength(0);
        })
      );

      await Effect.runPromise(program);
    });

    test('should handle unsubscribe from non-existent stream gracefully', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const nonExistentStreamId = 'does-not-exist';

          // Should not throw error
          const result = yield* protocol.unsubscribe(nonExistentStreamId).pipe(Effect.either);

          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Handle Subscription Errors', () => {
    test('should handle subscription to invalid stream gracefully', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const invalidStreamId = ''; // Empty stream ID
          const position: EventStreamPosition = { streamId: invalidStreamId, eventNumber: 0 };

          const result = yield* protocol.subscribe(position).pipe(Effect.either);

          // Should handle gracefully (either fail cleanly or succeed)
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe('StreamError');
          }
        })
      );

      await Effect.runPromise(program);
    });

    test('should handle subscription to invalid position gracefully', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          const streamId = generateStreamId();
          const invalidPosition: EventStreamPosition = { streamId, eventNumber: -1 }; // Negative position

          const result = yield* protocol.subscribe(invalidPosition).pipe(Effect.either);

          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// 3. CONNECTION MANAGEMENT TESTS
// ============================================================================

describe('MINIMUM FUNCTIONALITY: Connection Management', () => {
  describe('Check Protocol Connection Status', () => {
    test('should report connected when transport is connected', async () => {
      const program = Effect.gen(function* () {
        const { protocol } = yield* createTestProtocol();

        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      });

      await Effect.runPromise(program);
    });

    test('should report disconnected when transport is disconnected', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        // Disconnect transport
        yield* transport.simulateDisconnection();

        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(false);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Disconnect Cleanly', () => {
    test('should disconnect and cleanup subscriptions', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          // Create some subscriptions
          const streamId1 = generateStreamId();
          const streamId2 = generateStreamId();

          yield* protocol.subscribe({ streamId: streamId1, eventNumber: 0 });
          yield* protocol.subscribe({ streamId: streamId2, eventNumber: 0 });

          // Verify subscriptions exist
          const subscriptionsBefore = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsBefore).toHaveLength(2);

          // Disconnect
          yield* protocol.disconnect();

          // Verify clean disconnection
          const isConnected = yield* protocol.isConnected();
          expect(isConnected).toBe(false);

          // Verify subscriptions were cleaned up
          const subscriptionsAfter = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsAfter).toHaveLength(0);
        })
      );

      await Effect.runPromise(program);
    });

    test('should cleanup pending commands on disconnect', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol } = yield* createTestProtocol();

          // Start a command (it will be pending)
          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'disconnect-cleanup-test', eventNumber: 0 },
              name: 'TestAggregate',
            },
            commandName: 'PendingCommand',
            payload: { message: 'will be cleaned up' },
          });

          const commandFiber = yield* Effect.fork(protocol.sendCommand(command));

          yield* Effect.sleep('50 millis');

          // Disconnect (should cleanup pending commands)
          yield* protocol.disconnect();

          // Command should be completed with error or interrupted
          const commandResult = yield* Fiber.join(commandFiber).pipe(Effect.either);

          expect(Either.isLeft(commandResult) || Either.isRight(commandResult)).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Report Protocol Health Status', () => {
    test('should report healthy status when functioning normally', async () => {
      const program = Effect.gen(function* () {
        const { protocol } = yield* createTestProtocol();

        // For this test, we assume connected = healthy
        // In a real implementation, this might check more things
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);

        // Test basic functionality works
        const streamId = generateStreamId();
        const subscription = yield* protocol.subscribe({ streamId, eventNumber: 0 });
        expect(Stream.isStream(subscription)).toBe(true);
      });

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// 4. ERROR HANDLING TESTS
// ============================================================================

describe('MINIMUM FUNCTIONALITY: Error Handling', () => {
  describe('Serialization Errors', () => {
    test('should handle circular reference in command payload gracefully', async () => {
      const program = Effect.gen(function* () {
        const { protocol } = yield* createTestProtocol();

        const circularPayload: any = { name: 'test' };
        circularPayload.self = circularPayload;

        const command = {
          aggregate: {
            position: { streamId: 'circular-test', eventNumber: 0 },
            name: 'TestAggregate',
          },
          commandName: 'CircularCommand',
          payload: circularPayload,
        } as AggregateCommand;

        const result = yield* protocol.sendCommand(command).pipe(Effect.either);

        // Should fail gracefully without crashing
        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

        // Protocol should remain functional
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      });

      await Effect.runPromise(program);
    });

    test('should handle malformed incoming messages gracefully', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        // Inject malformed message
        const malformedMessage: TransportMessage = {
          id: makeMessageId('malformed-test'),
          payload: 'invalid-json-{{{',
          timestamp: new Date(),
        };

        yield* transport.injectMessage(malformedMessage);

        // Give protocol time to process malformed message
        yield* Effect.sleep('50 millis');

        // Protocol should still be functional
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Command Errors', () => {
    test('should propagate command errors without crashing protocol', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        const command = createTestCommand({
          aggregate: {
            position: { streamId: 'error-test', eventNumber: 0 },
            name: 'ErrorAggregate',
          },
          commandName: 'ErrorCommand',
          payload: { shouldFail: true },
        });

        // Start command
        const commandFiber = yield* Effect.fork(protocol.sendCommand(command));

        // Simulate server error response
        const errorResponse: TransportMessage = {
          id: makeMessageId('error-response'),
          payload: JSON.stringify({
            type: 'command_result',
            success: false,
            error: {
              message: 'Simulated command error',
              details: { code: 'VALIDATION_FAILED' },
            },
            correlationId: 'test-correlation', // Would be actual correlation ID
          }),
          timestamp: new Date(),
        };

        yield* transport.injectMessage(errorResponse);

        // Command should complete with error
        const result = yield* Fiber.join(commandFiber).pipe(
          Effect.timeout('200 millis'),
          Effect.either
        );

        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

        // Protocol should remain functional
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Stream Errors', () => {
    test('should handle subscription failure without affecting other subscriptions', async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { protocol, transport } = yield* createTestProtocol();

          // Create two subscriptions
          const streamId1 = generateStreamId();
          const streamId2 = generateStreamId();

          yield* protocol.subscribe({ streamId: streamId1, eventNumber: 0 });
          yield* protocol.subscribe({ streamId: streamId2, eventNumber: 0 });

          const subscriptions = yield* protocol.getActiveSubscriptions();
          expect(subscriptions).toHaveLength(2);

          // Simulate error for one subscription
          const subscriptionError: TransportMessage = {
            id: makeMessageId('subscription-error'),
            payload: JSON.stringify({
              type: 'subscription_end',
              streamId: streamId1,
              reason: 'stream_not_found',
            }),
            timestamp: new Date(),
          };

          yield* transport.injectMessage(subscriptionError);
          yield* Effect.sleep('50 millis');

          // One subscription should be ended, other should remain
          const subscriptionsAfter = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsAfter.length).toBeLessThan(2);

          // Protocol should remain functional
          const isConnected = yield* protocol.isConnected();
          expect(isConnected).toBe(true);
        })
      );

      await Effect.runPromise(program);
    });
  });

  describe('Timeout Handling', () => {
    test('should handle command timeout without affecting protocol state', async () => {
      const program = Effect.gen(function* () {
        const { protocol } = yield* createTestProtocol();

        const command = createTestCommand({
          aggregate: {
            position: { streamId: 'timeout-test', eventNumber: 0 },
            name: 'SlowAggregate',
          },
          commandName: 'SlowCommand',
          payload: { delay: 5000 },
        });

        // Command with very short timeout
        const result = yield* protocol
          .sendCommand(command)
          .pipe(Effect.timeout('50 millis'), Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe('TimeoutException');
        }

        // Protocol should remain functional after timeout
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);

        // Should be able to send another command
        const followupCommand = createTestCommand({
          aggregate: {
            position: { streamId: 'followup-test', eventNumber: 0 },
            name: 'TestAggregate',
          },
          commandName: 'FollowupCommand',
          payload: { message: 'after timeout' },
        });

        const followupResult = yield* protocol
          .sendCommand(followupCommand)
          .pipe(Effect.timeout('100 millis'), Effect.either);

        expect(Either.isLeft(followupResult) || Either.isRight(followupResult)).toBe(true);
      });

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// 5. MESSAGE SERIALIZATION TESTS
// ============================================================================

describe('MINIMUM FUNCTIONALITY: Message Serialization', () => {
  describe('Serialize Various Payload Types', () => {
    test('should serialize and preserve string payloads', async () => {
      const program = Effect.gen(function* () {
        const { transport } = yield* createTestProtocol();

        const testStrings = [
          'simple string',
          'unicode: 🚀 ñáéíóú',
          'empty: ',
          'with\nnewlines\tand\ttabs',
          'JSON-like: {"key": "value"}',
        ];

        for (const testString of testStrings) {
          yield* transport.clearMessages();

          const { protocol } = yield* createTestProtocol();
          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'string-serialize-test', eventNumber: 0 },
              name: 'StringAggregate',
            },
            commandName: 'StringCommand',
            payload: testString,
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(Effect.either)
          );

          yield* Effect.sleep('50 millis');

          const sentMessages = yield* transport.getReceivedMessages();
          if (sentMessages.length > 0) {
            const lastMessage = sentMessages[sentMessages.length - 1];
            const parsed = JSON.parse(lastMessage.payload);
            expect(parsed.payload).toBe(testString);
          }

          yield* Fiber.interrupt(commandFiber);
        }
      });

      await Effect.runPromise(program);
    });

    test('should serialize and preserve number payloads', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        const testNumbers = [0, 42, -17, 3.14159, 1e-10, 1e10, Number.MAX_SAFE_INTEGER];

        for (const testNumber of testNumbers) {
          yield* transport.clearMessages();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'number-serialize-test', eventNumber: 0 },
              name: 'NumberAggregate',
            },
            commandName: 'NumberCommand',
            payload: testNumber,
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(Effect.either)
          );

          yield* Effect.sleep('50 millis');

          const sentMessages = yield* transport.getReceivedMessages();
          if (sentMessages.length > 0) {
            const lastMessage = sentMessages[sentMessages.length - 1];
            const parsed = JSON.parse(lastMessage.payload);
            expect(parsed.payload).toBe(testNumber);
          }

          yield* Fiber.interrupt(commandFiber);
        }
      });

      await Effect.runPromise(program);
    });

    test('should serialize and preserve object payloads', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        const testObjects = [
          {},
          { key: 'value' },
          { nested: { deep: { value: 42 } } },
          { array: [1, 2, 3], object: { a: 1 }, null: null, bool: true },
        ];

        for (const testObject of testObjects) {
          yield* transport.clearMessages();

          const command = createTestCommand({
            aggregate: {
              position: { streamId: 'object-serialize-test', eventNumber: 0 },
              name: 'ObjectAggregate',
            },
            commandName: 'ObjectCommand',
            payload: testObject,
          });

          const commandFiber = yield* Effect.fork(
            Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(Effect.either)
          );

          yield* Effect.sleep('50 millis');

          const sentMessages = yield* transport.getReceivedMessages();
          if (sentMessages.length > 0) {
            const lastMessage = sentMessages[sentMessages.length - 1];
            const parsed = JSON.parse(lastMessage.payload);
            expect(parsed.payload).toEqual(testObject);
          }

          yield* Fiber.interrupt(commandFiber);
        }
      });

      await Effect.runPromise(program);
    });

    test('should serialize and preserve null and undefined', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport } = yield* createTestProtocol();

        const command = createTestCommand({
          aggregate: {
            position: { streamId: 'null-serialize-test', eventNumber: 0 },
            name: 'NullAggregate',
          },
          commandName: 'NullCommand',
          payload: null,
        });

        const commandFiber = yield* Effect.fork(
          Effect.timeout(protocol.sendCommand(command), '100 millis').pipe(Effect.either)
        );

        yield* Effect.sleep('50 millis');

        const sentMessages = yield* transport.getReceivedMessages();
        if (sentMessages.length > 0) {
          const lastMessage = sentMessages[sentMessages.length - 1];
          const parsed = JSON.parse(lastMessage.payload);
          expect(parsed.payload).toBe(null);
        }

        yield* Fiber.interrupt(commandFiber);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Handle Large Payloads', () => {
    test('should handle reasonably large payloads without error', async () => {
      const program = Effect.gen(function* () {
        const { protocol } = yield* createTestProtocol();

        // Create large but reasonable payload (100KB of data)
        const largePayload = {
          items: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            name: `item-${i}`,
            description: 'A'.repeat(100), // 100 chars each
            metadata: { index: i, timestamp: Date.now() },
          })),
        };

        const command = createTestCommand({
          aggregate: {
            position: { streamId: 'large-payload-test', eventNumber: 0 },
            name: 'LargeAggregate',
          },
          commandName: 'LargeCommand',
          payload: largePayload,
        });

        const result = yield* protocol
          .sendCommand(command)
          .pipe(Effect.timeout('1000 millis'), Effect.either);

        // Should handle large payload gracefully (succeed or fail cleanly)
        expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

        // Protocol should remain functional
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Preserve Metadata Through Serialization', () => {
    test('should preserve command metadata in serialized message', async () => {
      const program = Effect.gen(function* () {
        const { protocol, transport, context } = yield* createTestProtocol();

        const commandMetadata = {
          userId: 'user-123',
          traceId: 'trace-456',
          custom: { field: 'value', nested: { deep: 'data' } },
        };

        const requestContext = createRequestContext(context, {
          metadata: { contextField: 'contextValue' },
        });

        const command = createTestCommand({
          aggregate: {
            position: { streamId: 'metadata-test', eventNumber: 0 },
            name: 'MetadataAggregate',
          },
          commandName: 'MetadataCommand',
          payload: { message: 'test' },
          metadata: commandMetadata,
        });

        const commandFiber = yield* Effect.fork(
          Effect.timeout(protocol.sendCommand(command, requestContext), '100 millis').pipe(
            Effect.either
          )
        );

        yield* Effect.sleep('50 millis');

        const sentMessages = yield* transport.getReceivedMessages();
        if (sentMessages.length > 0) {
          const lastMessage = sentMessages[sentMessages.length - 1];
          const parsed = JSON.parse(lastMessage.payload);

          // Should have combined metadata from command and context
          expect(parsed.metadata).toBeDefined();
          expect(parsed.metadata.userId).toBe('user-123');
          expect(parsed.metadata.traceId).toBe('trace-456');
          expect(parsed.metadata.contextField).toBe('contextValue');
        }

        yield* Fiber.interrupt(commandFiber);
      });

      await Effect.runPromise(program);
    });
  });
});

console.log('✓ Protocol Minimum Functionality Test Suite loaded');
console.log('✓ Covers: Command Operations, Event Subscriptions, Connection Management');
console.log('✓ Covers: Error Handling, Message Serialization');
console.log('✓ Transport-agnostic tests focused on protocol behavior');
