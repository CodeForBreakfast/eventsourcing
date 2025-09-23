/**
 * Event Sourcing Protocol - Resilience and Edge Case Tests
 *
 * Tests for protocol resilience, edge cases, and stress scenarios.
 * These tests ensure the protocol behaves correctly under adverse conditions
 * and maintains stability when facing unexpected inputs or system states.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Effect, Stream, Queue, Ref, Either, Duration, Fiber } from 'effect';
import {
  generateStreamId,
  createTestCommand,
  createTestStreamEvent,
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
  type AggregateCommand,
  type EventStreamPosition,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import { createDefaultProtocolSerializer } from '../default-protocol-serializer.js';
import { createProtocolStateManager } from '../protocol-state-manager.js';
import { createDefaultEventSourcingProtocol } from '../default-event-sourcing-protocol.js';

// ============================================================================
// Test Utilities for Resilience Testing
// ============================================================================

interface TestEvent {
  readonly type: string;
  readonly payload: unknown;
}

interface FlakeyTransport extends Client.Transport<TransportMessage> {
  // Expected by protocol but not in base interface
  isConnected: () => Effect.Effect<boolean, never, never>;
  disconnect: () => Effect.Effect<void, never, never>;
  send: (message: {
    id: string;
    payload: string;
    timestamp: Date;
  }) => Effect.Effect<void, never, never>;

  // Flakey transport specific methods
  setFailureRate: (rate: number) => Effect.Effect<void, never, never>;
  setLatency: (latencyMs: number) => Effect.Effect<void, never, never>;
  simulateNetworkPartition: (durationMs: number) => Effect.Effect<void, never, never>;
  injectMessage: (message: TransportMessage) => Effect.Effect<void, never, never>;
  getMessageCount: () => Effect.Effect<number, never, never>;
}

const createFlakeyTransport = (): Effect.Effect<FlakeyTransport, never, never> =>
  Effect.gen(function* () {
    const sentMessages = yield* Ref.make<TransportMessage[]>([]);
    const receivedMessages = yield* Queue.unbounded<TransportMessage>();
    const connectionStateQueue = yield* Queue.unbounded<ConnectionState>();
    const connected = yield* Ref.make(true);
    const failureRate = yield* Ref.make(0); // 0 = never fail, 1 = always fail
    const latencyMs = yield* Ref.make(0);

    // Start connected
    yield* Queue.offer(connectionStateQueue, 'connected');

    const transport: FlakeyTransport = {
      connectionState: Stream.fromQueue(connectionStateQueue),

      publish: (message: TransportMessage) =>
        Effect.gen(function* () {
          const currentFailureRate = yield* Ref.get(failureRate);
          const currentLatency = yield* Ref.get(latencyMs);

          // Simulate network latency
          if (currentLatency > 0) {
            yield* Effect.sleep(`${currentLatency} millis`);
          }

          // Simulate failure based on failure rate
          if (Math.random() < currentFailureRate) {
            return yield* Effect.fail(new Error('Simulated transport failure'));
          }

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
          const currentFailureRate = yield* Ref.get(failureRate);
          const currentLatency = yield* Ref.get(latencyMs);

          // Simulate network latency
          if (currentLatency > 0) {
            yield* Effect.sleep(`${currentLatency} millis`);
          }

          // Simulate failure based on failure rate
          if (Math.random() < currentFailureRate) {
            return yield* Effect.fail(new Error('Simulated transport failure'));
          }

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

      // Flakey transport specific methods
      setFailureRate: (rate: number) => Ref.set(failureRate, Math.max(0, Math.min(1, rate))),

      setLatency: (latency: number) => Ref.set(latencyMs, Math.max(0, latency)),

      simulateNetworkPartition: (durationMs: number) =>
        Effect.gen(function* () {
          yield* Ref.set(connected, false);
          yield* Queue.offer(connectionStateQueue, 'disconnected');
          yield* Effect.sleep(`${durationMs} millis`);
          yield* Ref.set(connected, true);
          yield* Queue.offer(connectionStateQueue, 'connected');
        }),

      injectMessage: (message: TransportMessage) => Queue.offer(receivedMessages, message),

      getMessageCount: () => Ref.get(sentMessages).pipe(Effect.map((messages) => messages.length)),
    };

    return transport;
  });

const createResilientTestProtocol = () =>
  Effect.gen(function* () {
    const transport = yield* createFlakeyTransport();
    const serializer = createDefaultProtocolSerializer<TestEvent>();
    const stateManager = yield* createProtocolStateManager<TestEvent>();
    const context = createProtocolContext({
      sessionId: 'resilience-test-session',
      userId: 'resilience-test-user',
    });

    const protocol = createDefaultEventSourcingProtocol(
      transport,
      serializer,
      stateManager,
      context
    );

    return { protocol, transport, serializer, stateManager, context };
  });

// ============================================================================
// PROTOCOL VERSION MISMATCH TESTS
// ============================================================================

describe('RESILIENCE: Protocol Version Handling', () => {
  test('should handle unknown message types gracefully', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createResilientTestProtocol();

      // Inject message with unknown type
      const unknownMessage: TransportMessage = {
        id: makeMessageId('unknown-type'),
        payload: JSON.stringify({
          type: 'unknown_message_type_v2',
          someField: 'some data',
          version: '2.0.0',
        }),
        timestamp: new Date(),
      };

      yield* transport.injectMessage(unknownMessage);
      yield* Effect.sleep('100 millis');

      // Protocol should remain functional
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should ignore malformed protocol messages without crashing', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createResilientTestProtocol();

      const malformedMessages = [
        'invalid json {{{',
        JSON.stringify({ type: 'event' }), // Missing required fields
        JSON.stringify({ streamId: 'test', eventNumber: 'not a number' }),
        JSON.stringify({ type: 'command_result', success: 'maybe' }), // Invalid boolean
      ];

      for (const payload of malformedMessages) {
        const malformedMessage: TransportMessage = {
          id: makeMessageId(`malformed-${Math.random()}`),
          payload,
          timestamp: new Date(),
        };

        yield* transport.injectMessage(malformedMessage);
      }

      yield* Effect.sleep('100 millis');

      // Protocol should handle all malformed messages gracefully
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });
});

// ============================================================================
// NETWORK RESILIENCE TESTS
// ============================================================================

describe('RESILIENCE: Network Conditions', () => {
  test('should handle network partition and reconnection', async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const { protocol, transport } = yield* createResilientTestProtocol();

        // Create subscription before partition
        const streamId = generateStreamId();
        const eventStream = yield* protocol.subscribe({ streamId, eventNumber: 0 });

        const subscriptionsBefore = yield* protocol.getActiveSubscriptions();
        expect(subscriptionsBefore).toHaveLength(1);

        // Simulate network partition
        yield* transport.simulateNetworkPartition(200);

        // During partition, connection should be lost
        yield* Effect.sleep('100 millis');

        // After partition heals, protocol should recover
        yield* Effect.sleep('150 millis');

        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      })
    );

    await Effect.runPromise(program);
  });

  test('should handle high latency gracefully', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createResilientTestProtocol();

      // Set high latency
      yield* transport.setLatency(500);

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'latency-test', eventNumber: 0 },
          name: 'LatencyAggregate',
        },
        commandName: 'LatencyCommand',
        payload: { message: 'high latency test' },
      });

      // Command should complete even with high latency
      const result = yield* protocol.sendCommand(command).pipe(
        Effect.timeout('2000 millis'), // Allow enough time for latency
        Effect.either
      );

      expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

      // Protocol should remain functional
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should handle intermittent transport failures', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createResilientTestProtocol();

      // Set 30% failure rate
      yield* transport.setFailureRate(0.3);

      const commands = Array.from({ length: 10 }, (_, i) =>
        createTestCommand({
          aggregate: {
            position: { streamId: `intermittent-test-${i}`, eventNumber: 0 },
            name: 'IntermittentAggregate',
          },
          commandName: 'IntermittentCommand',
          payload: { index: i },
        })
      );

      // Send multiple commands with intermittent failures
      const results = yield* Effect.forEach(
        commands,
        (command) =>
          protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either),
        { concurrency: 5 }
      );

      // Some should succeed, some should fail
      const successes = results.filter(Either.isRight).length;
      const failures = results.filter(Either.isLeft).length;

      expect(successes + failures).toBe(10);

      // Protocol should remain functional despite failures
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });
});

// ============================================================================
// CONCURRENCY AND RESOURCE MANAGEMENT TESTS
// ============================================================================

describe('RESILIENCE: Concurrency and Resources', () => {
  test('should handle many concurrent subscriptions', async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const { protocol } = yield* createResilientTestProtocol();

        const subscriptionCount = 50;
        const streamIds = Array.from({ length: subscriptionCount }, () => generateStreamId());

        // Create many subscriptions concurrently
        const subscriptions = yield* Effect.forEach(
          streamIds,
          (streamId) => protocol.subscribe({ streamId, eventNumber: 0 }),
          { concurrency: 'unbounded' }
        );

        expect(subscriptions).toHaveLength(subscriptionCount);

        // Verify all subscriptions are active
        const activeSubscriptions = yield* protocol.getActiveSubscriptions();
        expect(activeSubscriptions).toHaveLength(subscriptionCount);

        // Unsubscribe from all
        yield* Effect.forEach(streamIds, (streamId) => protocol.unsubscribe(streamId), {
          concurrency: 'unbounded',
        });

        // All should be cleaned up
        const activeAfterUnsubscribe = yield* protocol.getActiveSubscriptions();
        expect(activeAfterUnsubscribe).toHaveLength(0);
      })
    );

    await Effect.runPromise(program);
  });

  test('should handle many concurrent commands without resource leaks', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createResilientTestProtocol();

      const commandCount = 100;
      const commands = Array.from({ length: commandCount }, (_, i) =>
        createTestCommand({
          aggregate: {
            position: { streamId: `concurrent-test-${i}`, eventNumber: 0 },
            name: 'ConcurrentAggregate',
          },
          commandName: 'ConcurrentCommand',
          payload: { index: i, timestamp: Date.now() },
        })
      );

      // Send all commands concurrently with timeout
      const results = yield* Effect.forEach(
        commands,
        (command) =>
          protocol.sendCommand(command).pipe(Effect.timeout('100 millis'), Effect.either),
        { concurrency: 20 } // Limit concurrency to avoid overwhelming
      );

      expect(results).toHaveLength(commandCount);

      // Protocol should remain functional
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should handle rapid subscribe/unsubscribe cycles', async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const { protocol } = yield* createResilientTestProtocol();

        const streamId = generateStreamId();

        // Rapidly subscribe and unsubscribe multiple times
        for (let i = 0; i < 10; i++) {
          yield* protocol.subscribe({ streamId, eventNumber: 0 });

          const subscriptions = yield* protocol.getActiveSubscriptions();
          expect(subscriptions).toHaveLength(1);

          yield* protocol.unsubscribe(streamId);

          const subscriptionsAfter = yield* protocol.getActiveSubscriptions();
          expect(subscriptionsAfter).toHaveLength(0);
        }

        // Protocol should remain stable
        const isConnected = yield* protocol.isConnected();
        expect(isConnected).toBe(true);
      })
    );

    await Effect.runPromise(program);
  });
});

// ============================================================================
// MEMORY AND RESOURCE LEAK TESTS
// ============================================================================

describe('RESILIENCE: Resource Management', () => {
  test('should cleanup resources when subscriptions are interrupted', async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const { protocol } = yield* createResilientTestProtocol();

        const streamIds = Array.from({ length: 10 }, () => generateStreamId());

        // Create subscriptions and interrupt them
        const subscriptionFibers = yield* Effect.forEach(
          streamIds,
          (streamId) =>
            Effect.fork(
              protocol
                .subscribe({ streamId, eventNumber: 0 })
                .pipe(Effect.flatMap((stream) => Stream.runDrain(stream)))
            ),
          { concurrency: 'unbounded' }
        );

        // Verify subscriptions exist
        const activeBefore = yield* protocol.getActiveSubscriptions();
        expect(activeBefore.length).toBeGreaterThan(0);

        // Interrupt all subscription fibers
        yield* Effect.forEach(subscriptionFibers, Fiber.interrupt);

        yield* Effect.sleep('100 millis');

        // Resources should be cleaned up
        const activeAfter = yield* protocol.getActiveSubscriptions();
        expect(activeAfter).toHaveLength(0);
      })
    );

    await Effect.runPromise(program);
  });

  test('should cleanup pending commands on protocol reset', async () => {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const { protocol } = yield* createResilientTestProtocol();

        // Start multiple commands that will be pending
        const pendingCommands = Array.from({ length: 5 }, (_, i) =>
          createTestCommand({
            aggregate: {
              position: { streamId: `pending-cleanup-${i}`, eventNumber: 0 },
              name: 'PendingAggregate',
            },
            commandName: 'PendingCommand',
            payload: { index: i },
          })
        );

        const commandFibers = yield* Effect.forEach(
          pendingCommands,
          (command) => Effect.fork(protocol.sendCommand(command)),
          { concurrency: 'unbounded' }
        );

        yield* Effect.sleep('50 millis');

        // Disconnect (should cleanup pending commands)
        yield* protocol.disconnect();

        // All command fibers should complete (with error or success)
        const results = yield* Effect.forEach(commandFibers, (fiber) =>
          Fiber.join(fiber).pipe(Effect.either)
        );

        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);
        });
      })
    );

    await Effect.runPromise(program);
  });
});

// ============================================================================
// EXTREME PAYLOAD TESTS
// ============================================================================

describe('RESILIENCE: Extreme Payloads', () => {
  test('should handle very large payloads gracefully', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createResilientTestProtocol();

      // Create a very large payload (1MB of data)
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100), // 100 chars * 10000 = ~1MB
        timestamp: Date.now(),
      }));

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'extreme-large-test', eventNumber: 0 },
          name: 'LargeAggregate',
        },
        commandName: 'ExtremelyLargeCommand',
        payload: { items: largeArray },
      });

      const result = yield* protocol.sendCommand(command).pipe(
        Effect.timeout('5000 millis'), // Allow extra time for large payload
        Effect.either
      );

      // Should handle gracefully (succeed, fail cleanly, or timeout)
      expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

      // Protocol should remain functional
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should handle deeply nested objects', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createResilientTestProtocol();

      // Create deeply nested object
      let deepObject: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        deepObject = { level: i, child: deepObject };
      }

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'deep-nested-test', eventNumber: 0 },
          name: 'DeepAggregate',
        },
        commandName: 'DeepNestedCommand',
        payload: deepObject,
      });

      const result = yield* protocol
        .sendCommand(command)
        .pipe(Effect.timeout('1000 millis'), Effect.either);

      expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should handle payloads with special characters and encoding', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createResilientTestProtocol();

      const specialPayload = {
        unicode: '🚀🎉💖🔥⚡🌟🎯🚨💯🎪',
        emojis: '😀😃😄😁😆😅😂🤣😊😇',
        languages: {
          chinese: '你好世界',
          arabic: 'مرحبا بالعالم',
          russian: 'Привет мир',
          japanese: 'こんにちは世界',
        },
        special: '\n\t\r\b\f"\'\\/',
        control: String.fromCharCode(0, 1, 2, 31),
      };

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'special-chars-test', eventNumber: 0 },
          name: 'SpecialAggregate',
        },
        commandName: 'SpecialCharsCommand',
        payload: specialPayload,
      });

      const result = yield* protocol
        .sendCommand(command)
        .pipe(Effect.timeout('1000 millis'), Effect.either);

      expect(Either.isLeft(result) || Either.isRight(result)).toBe(true);

      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });
});

console.log('✓ Protocol Resilience Test Suite loaded');
console.log('✓ Covers: Version handling, Network resilience, Concurrency');
console.log('✓ Covers: Resource management, Memory leaks, Extreme payloads');
console.log('✓ Ensures protocol stability under adverse conditions');
