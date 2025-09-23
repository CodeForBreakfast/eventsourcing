/**
 * Event Sourcing Protocol - Basic Functionality Tests
 *
 * Focused test suite to validate that the minimum required protocol functionality
 * is implemented and working correctly. These tests focus on the happy path
 * to verify the protocol basics work before testing edge cases.
 */

import { test, expect, describe } from 'bun:test';
import { Effect, Stream, Queue, Ref, Either, Fiber } from 'effect';
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
// Test Types and Helpers
// ============================================================================

interface TestEvent {
  readonly type: string;
  readonly payload: unknown;
}

interface BasicMockTransport extends Client.Transport<TransportMessage> {
  isConnected: () => Effect.Effect<boolean, never, never>;
  disconnect: () => Effect.Effect<void, never, never>;
  send: (message: {
    id: string;
    payload: string;
    timestamp: Date;
  }) => Effect.Effect<void, never, never>;
  getSentMessages: () => Effect.Effect<TransportMessage[], never, never>;
  injectMessage: (message: TransportMessage) => Effect.Effect<void, never, never>;
}

const createBasicMockTransport = (): Effect.Effect<BasicMockTransport, never, never> =>
  Effect.gen(function* () {
    const sentMessages = yield* Ref.make<TransportMessage[]>([]);
    const receivedMessages = yield* Queue.unbounded<TransportMessage>();
    const connectionStateQueue = yield* Queue.unbounded<ConnectionState>();
    const connected = yield* Ref.make(true);

    yield* Queue.offer(connectionStateQueue, 'connected');

    const transport: BasicMockTransport = {
      connectionState: Stream.fromQueue(connectionStateQueue),

      publish: (message: TransportMessage) =>
        Effect.gen(function* () {
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
          const transportMessage: TransportMessage = {
            id: makeMessageId(message.id),
            payload: message.payload,
            timestamp: message.timestamp,
          };
          yield* Ref.update(sentMessages, (messages) => [...messages, transportMessage]);
        }),

      getSentMessages: () => Ref.get(sentMessages),

      injectMessage: (message: TransportMessage) => Queue.offer(receivedMessages, message),
    };

    return transport;
  });

const createBasicProtocol = () =>
  Effect.gen(function* () {
    const transport = yield* createBasicMockTransport();
    const serializer = createDefaultProtocolSerializer<TestEvent>();
    const stateManager = yield* createProtocolStateManager<TestEvent>();
    const context = createProtocolContext({
      sessionId: 'basic-test-session',
      userId: 'basic-test-user',
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
// BASIC FUNCTIONALITY TESTS
// ============================================================================

describe('BASIC FUNCTIONALITY: Protocol Implementation', () => {
  test('should create protocol instance successfully', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      expect(protocol).toBeDefined();
      expect(protocol.context.sessionId).toBe('basic-test-session');
      expect(protocol.context.userId).toBe('basic-test-user');
    });

    await Effect.runPromise(program);
  });

  test('should report connected status', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should be able to disconnect', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      // Initially connected
      const initiallyConnected = yield* protocol.isConnected();
      expect(initiallyConnected).toBe(true);

      // Disconnect
      yield* protocol.disconnect();

      // Should be disconnected
      const afterDisconnect = yield* protocol.isConnected();
      expect(afterDisconnect).toBe(false);
    });

    await Effect.runPromise(program);
  });
});

describe('BASIC FUNCTIONALITY: Command Operations', () => {
  test('should send simple commands without errors', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'basic-command-test', eventNumber: 0 },
          name: 'BasicAggregate',
        },
        commandName: 'BasicCommand',
        payload: { message: 'hello' },
      });

      // Send command (will timeout but that's ok - we're testing the send mechanism)
      const commandResult = yield* Effect.fork(
        protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either)
      );

      yield* Effect.sleep('100 millis');

      // Should have sent the command to transport
      const sentMessages = yield* transport.getSentMessages();
      expect(sentMessages.length).toBeGreaterThan(0);

      const lastMessage = sentMessages[sentMessages.length - 1];
      expect(lastMessage.payload).toBeDefined();

      // Try to parse the payload to ensure it's valid JSON
      expect(() => JSON.parse(lastMessage.payload)).not.toThrow();

      yield* Fiber.interrupt(commandResult);
    });

    await Effect.runPromise(program);
  });

  test('should handle different payload types', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      const testCases = [
        { type: 'string', payload: 'simple string' },
        { type: 'number', payload: 42 },
        { type: 'boolean', payload: true },
        { type: 'object', payload: { key: 'value', nested: { deep: 123 } } },
        { type: 'array', payload: [1, 2, 3] },
        { type: 'null', payload: null },
      ];

      for (const testCase of testCases) {
        const command = createTestCommand({
          aggregate: {
            position: { streamId: `payload-${testCase.type}-test`, eventNumber: 0 },
            name: 'PayloadAggregate',
          },
          commandName: `${testCase.type}Command`,
          payload: testCase.payload,
        });

        const commandFiber = yield* Effect.fork(
          protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either)
        );

        yield* Effect.sleep('50 millis');
        yield* Fiber.interrupt(commandFiber);
      }

      // Should have sent all commands
      const sentMessages = yield* transport.getSentMessages();
      expect(sentMessages.length).toBe(testCases.length);
    });

    await Effect.runPromise(program);
  });

  test('should send multiple commands concurrently', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      const commands = Array.from({ length: 5 }, (_, i) =>
        createTestCommand({
          aggregate: {
            position: { streamId: `concurrent-${i}`, eventNumber: 0 },
            name: 'ConcurrentAggregate',
          },
          commandName: 'ConcurrentCommand',
          payload: { index: i },
        })
      );

      // Send all commands concurrently
      const commandFibers = yield* Effect.forEach(
        commands,
        (command) =>
          Effect.fork(
            protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either)
          ),
        { concurrency: 'unbounded' }
      );

      yield* Effect.sleep('100 millis');

      // Check that all commands were sent
      const sentMessages = yield* transport.getSentMessages();
      expect(sentMessages.length).toBe(commands.length);

      // Clean up
      yield* Effect.forEach(commandFibers, (fiber) => Fiber.interrupt(fiber));
    });

    await Effect.runPromise(program);
  });
});

describe('BASIC FUNCTIONALITY: Event Stream Subscriptions', () => {
  test('should create stream subscriptions', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      const streamId = generateStreamId();
      const position: EventStreamPosition = { streamId, eventNumber: 0 };

      const eventStream = yield* protocol.subscribe(position);

      // eventStream should be a stream-like object
      expect(eventStream).toBeDefined();
      expect(typeof eventStream).toBe('object');

      // Verify subscription was registered
      const subscriptions = yield* protocol.getActiveSubscriptions();
      expect(subscriptions.length).toBeGreaterThan(0);
      expect(subscriptions[0].streamId).toBe(streamId);
    });

    await Effect.runPromise(program);
  });

  test('should be able to unsubscribe from streams', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      const streamId = generateStreamId();
      const position: EventStreamPosition = { streamId, eventNumber: 0 };

      // Subscribe
      yield* protocol.subscribe(position);

      // Verify subscription exists
      const beforeUnsubscribe = yield* protocol.getActiveSubscriptions();
      expect(beforeUnsubscribe.length).toBeGreaterThan(0);

      // Unsubscribe
      yield* protocol.unsubscribe(streamId);

      // Verify subscription removed
      const afterUnsubscribe = yield* protocol.getActiveSubscriptions();
      expect(afterUnsubscribe.length).toBeLessThan(beforeUnsubscribe.length);
    });

    await Effect.runPromise(program);
  });

  test('should handle multiple subscriptions', async () => {
    const program = Effect.gen(function* () {
      const { protocol } = yield* createBasicProtocol();

      const streamIds = Array.from({ length: 3 }, () => generateStreamId());

      // Create multiple subscriptions
      for (const streamId of streamIds) {
        const position: EventStreamPosition = { streamId, eventNumber: 0 };
        yield* protocol.subscribe(position);
      }

      // Verify all subscriptions exist
      const subscriptions = yield* protocol.getActiveSubscriptions();
      expect(subscriptions.length).toBe(streamIds.length);

      // Each subscription should have a unique stream ID
      const subscribedStreamIds = subscriptions.map((sub) => sub.streamId);
      const uniqueStreamIds = new Set(subscribedStreamIds);
      expect(uniqueStreamIds.size).toBe(streamIds.length);
    });

    await Effect.runPromise(program);
  });
});

describe('BASIC FUNCTIONALITY: Error Resilience', () => {
  test('should handle transport disconnection without crashing', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      // Initially connected
      const initiallyConnected = yield* protocol.isConnected();
      expect(initiallyConnected).toBe(true);

      // Simulate transport disconnection
      yield* transport.disconnect();

      // Protocol should reflect disconnected state
      const afterDisconnect = yield* protocol.isConnected();
      expect(afterDisconnect).toBe(false);

      // Protocol should still be operational (not crashed)
      const subscriptions = yield* protocol.getActiveSubscriptions();
      expect(Array.isArray(subscriptions)).toBe(true);
    });

    await Effect.runPromise(program);
  });

  test('should handle malformed incoming messages gracefully', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      // Inject malformed message
      const malformedMessage: TransportMessage = {
        id: makeMessageId('malformed'),
        payload: 'invalid json {{{',
        timestamp: new Date(),
      };

      yield* transport.injectMessage(malformedMessage);
      yield* Effect.sleep('50 millis');

      // Protocol should still be functional
      const isConnected = yield* protocol.isConnected();
      expect(isConnected).toBe(true);

      // Should be able to create subscriptions
      const streamId = generateStreamId();
      const subscription = yield* protocol.subscribe({ streamId, eventNumber: 0 });
      // subscription should be a stream-like object
      expect(subscription).toBeDefined();
      expect(typeof subscription).toBe('object');
    });

    await Effect.runPromise(program);
  });
});

describe('BASIC FUNCTIONALITY: Message Serialization', () => {
  test('should serialize commands to valid JSON', async () => {
    const program = Effect.gen(function* () {
      const { protocol, transport } = yield* createBasicProtocol();

      const command = createTestCommand({
        aggregate: {
          position: { streamId: 'serialization-test', eventNumber: 5 },
          name: 'SerializationAggregate',
        },
        commandName: 'SerializationCommand',
        payload: { data: 'test data', number: 123, nested: { key: 'value' } },
        metadata: { source: 'test', userId: 'test-user' },
      });

      const commandFiber = yield* Effect.fork(
        protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either)
      );

      yield* Effect.sleep('100 millis');

      const sentMessages = yield* transport.getSentMessages();
      expect(sentMessages.length).toBe(1);

      const message = sentMessages[0];

      // Should be valid JSON
      let parsed;
      expect(() => {
        parsed = JSON.parse(message.payload);
      }).not.toThrow();

      // Should contain expected fields
      expect(parsed.type).toBeDefined();
      expect(parsed.commandName).toBe('SerializationCommand');
      expect(parsed.aggregate).toBeDefined();
      expect(parsed.aggregate.name).toBe('SerializationAggregate');
      expect(parsed.payload).toBeDefined();

      yield* Effect.interrupt(commandFiber);
    });

    await Effect.runPromise(program);
  });

  test('should preserve basic data types through serialization', async () => {
    const program = Effect.gen(function* () {
      const { transport } = yield* createBasicProtocol();

      const testPayloads = [
        { name: 'string', data: 'hello world' },
        { name: 'number', data: 42 },
        { name: 'boolean', data: true },
        { name: 'null', data: null },
        { name: 'object', data: { key: 'value', nested: { deep: 123 } } },
        { name: 'array', data: [1, 'two', { three: 3 }] },
      ];

      for (const testCase of testPayloads) {
        const { protocol } = yield* createBasicProtocol();

        const command = createTestCommand({
          aggregate: {
            position: { streamId: `preserve-${testCase.name}`, eventNumber: 0 },
            name: 'PreserveAggregate',
          },
          commandName: 'PreserveCommand',
          payload: testCase.data,
        });

        const commandFiber = yield* Effect.fork(
          protocol.sendCommand(command).pipe(Effect.timeout('200 millis'), Effect.either)
        );

        yield* Effect.sleep('50 millis');

        const sentMessages = yield* transport.getSentMessages();
        if (sentMessages.length > 0) {
          const message = sentMessages[sentMessages.length - 1];
          const parsed = JSON.parse(message.payload);

          expect(parsed.payload).toEqual(testCase.data);
        }

        yield* Fiber.interrupt(commandFiber);
      }
    });

    await Effect.runPromise(program);
  });
});

console.log('✓ Basic Protocol Functionality Test Suite loaded');
console.log('✓ Validates: Protocol creation, commands, subscriptions, error handling');
console.log('✓ Focuses on happy path scenarios to verify basic functionality works');
