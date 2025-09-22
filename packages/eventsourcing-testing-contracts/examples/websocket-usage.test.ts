/**
 * Example: Using the testing contracts with a WebSocket transport implementation
 *
 * This example shows how to migrate from the old WebSocket-specific testing
 * to the new centralized testing contracts package.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Effect, Layer, Stream, pipe } from 'effect';
import {
  runDomainContractTests,
  runTransportContractTests,
  runEventSourcingTransportTests,
  runIntegrationTestSuite,
  createMockDomainContext,
  createMockTransport,
  generateStreamId,
  createTestCommand,
  type EventTransportService,
  type MockEventServer,
} from '../src/index.js';

// ============================================================================
// Example: Basic Usage with Mock Implementations
// ============================================================================

describe('Example: WebSocket Transport Testing with Contracts', () => {
  // Test domain contracts using mock implementation
  runDomainContractTests('Mock WebSocket Domain', () => createMockDomainContext());

  // Test transport contracts using mock implementation
  runTransportContractTests('Mock WebSocket Transport', () => createMockTransport(), {
    supportsReconnection: true,
    supportsOfflineBuffering: true,
    supportsBackpressure: true,
    guaranteesOrdering: true,
    supportsMultiplexing: true,
  });

  // Test event sourcing specific transport features
  runEventSourcingTransportTests(
    'Mock WebSocket Event Transport',
    () =>
      Effect.gen(function* () {
        const base = yield* createMockTransport();
        return {
          ...base,
          getMessageMetrics: () =>
            Effect.succeed({
              messagesSent: 10,
              messagesReceived: 8,
              averageLatency: 50,
              connectionDrops: 1,
            }),
        };
      }),
    {
      supportsEventOrdering: true,
      supportsEventReplay: true,
      supportsStreamFiltering: true,
      supportsMetrics: true,
    }
  );
});

// ============================================================================
// Example: Integration Testing with Mock Server
// ============================================================================

describe('Example: Integration Testing', () => {
  // Mock EventTransport implementation for demonstration
  const createMockEventTransportLayer = (): Layer.Layer<EventTransportService, never, never> =>
    Layer.effect(
      'MockEventTransport' as any,
      Effect.succeed({
        subscribe: <TEvent>(position: any) =>
          Effect.succeed(
            Stream.fromIterable([
              {
                position,
                event: { type: 'test', data: 'mock-event' },
                timestamp: new Date(),
              },
            ])
          ),
        sendCommand: <TPayload>(command: any) =>
          Effect.succeed({
            _tag: 'Right',
            right: {
              streamId: command.aggregate.position.streamId,
              eventNumber: command.aggregate.position.eventNumber + 1,
            },
          } as any),
        disconnect: () => Effect.void,
      })
    );

  // Mock server for testing
  const createMockEventServer = (): Effect.Effect<MockEventServer, never, never> =>
    Effect.succeed({
      sendEvent: (streamId, event) => Effect.void,
      expectSubscription: (streamId) => Effect.void,
      expectCommand: (command) => Effect.void,
      respondToCommand: (result) => Effect.void,
      cleanup: () => Effect.void,
      waitForConnection: () => Effect.void,
      simulateDisconnect: () => Effect.void,
      simulateReconnect: () => Effect.void,
    });

  runIntegrationTestSuite(
    'Mock WebSocket Integration',
    createMockEventTransportLayer,
    createMockEventServer,
    {
      supportsReconnection: true,
      supportsOfflineBuffering: true,
      supportsBackpressure: false,
      maintainsOrderingDuringReconnect: true,
      supportsStreamFiltering: true,
      supportsCommandPipelining: true,
    }
  );
});

// ============================================================================
// Example: Custom Implementation-Specific Tests
// ============================================================================

describe('Example: WebSocket-Specific Features', () => {
  it('should handle WebSocket ping/pong frames', async () => {
    // Custom test for WebSocket-specific behavior
    // This would test actual WebSocket implementation details
    expect(true).toBe(true); // Placeholder
  });

  it('should handle WebSocket close codes correctly', async () => {
    // Test proper handling of different WebSocket close codes
    // 1000 = Normal Closure
    // 1001 = Going Away
    // 1002 = Protocol Error
    // etc.
    expect(true).toBe(true); // Placeholder
  });

  it('should support WebSocket subprotocols', async () => {
    // Test WebSocket subprotocol negotiation
    expect(true).toBe(true); // Placeholder
  });

  it('should handle binary and text frames', async () => {
    // Test that transport can handle both binary and text WebSocket frames
    expect(true).toBe(true); // Placeholder
  });

  it('should implement proper WebSocket error handling', async () => {
    // Test WebSocket-specific error scenarios
    expect(true).toBe(true); // Placeholder
  });
});

// ============================================================================
// Example: Migration from Old Testing Structure
// ============================================================================

describe('Example: Migration Guide', () => {
  it('demonstrates how to migrate from old WebSocket tests', () => {
    // OLD WAY (WebSocket package specific):
    // import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-websocket-transport';

    // NEW WAY (Centralized testing contracts):
    // import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';

    // The function signatures and behavior are identical, but now:
    // 1. Tests are transport-agnostic
    // 2. All implementations can use the same test suite
    // 3. Better mock implementations and utilities available
    // 4. More comprehensive test coverage

    expect(true).toBe(true);
  });

  it('shows benefits of the new structure', () => {
    // BENEFITS:
    // ✅ Transport agnostic - works with WebSocket, HTTP, SSE, custom transports
    // ✅ Protocol agnostic - tests core event sourcing behaviors
    // ✅ Better mocks - ready-to-use mock implementations
    // ✅ More utilities - test data generators, helpers, scenarios
    // ✅ Better documentation - comprehensive testing guide
    // ✅ Consistent API - same test patterns across all implementations

    expect(true).toBe(true);
  });
});

// ============================================================================
// Example: Using Test Utilities
// ============================================================================

describe('Example: Test Utilities Usage', () => {
  it('demonstrates test data generation', () => {
    // Generate unique stream IDs
    const streamId = generateStreamId('user-stream');
    expect(streamId).toMatch(/^user-stream-/);

    // Create test commands
    const command = createTestCommand(
      { action: 'update-profile', userId: 123 },
      {
        aggregateName: 'User',
        commandName: 'UpdateProfile',
        position: { streamId, eventNumber: 0 },
      }
    );

    expect(command.aggregate.name).toBe('User');
    expect(command.commandName).toBe('UpdateProfile');
    expect(command.payload).toEqual({ action: 'update-profile', userId: 123 });
  });

  it('demonstrates mock usage', async () => {
    const transport = await Effect.runPromise(createMockTransport());

    // Test connection lifecycle
    expect(await Effect.runPromise(transport.isConnected())).toBe(false);
    await Effect.runPromise(transport.connect());
    expect(await Effect.runPromise(transport.isConnected())).toBe(true);

    // Test message publishing
    await Effect.runPromise(
      transport.publish({
        id: 'test-msg',
        type: 'test',
        payload: { data: 'hello' },
        timestamp: new Date(),
      })
    );

    expect(await Effect.runPromise(transport.getBufferedMessageCount())).toBe(0);
  });
});
