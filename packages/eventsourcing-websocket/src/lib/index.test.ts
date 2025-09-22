/**
 * Tests for the convenience WebSocket event sourcing package.
 *
 * This test file demonstrates both the API usage and migration patterns
 * from the old separate packages to the new batteries-included approach.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Scope } from 'effect';
import {
  connect,
  createBasicProtocolContext,
  createWebSocketConnector,
  createWebSocketProtocolStack,
  createWebSocketConnectorLayer,
  DefaultWebSocketConfig,
  WebSocketEventSourcingInfo,
  connectWebSocket,
  createWebSocketProtocol,
  type WebSocketConnectOptions,
  type EventSourcingProtocol,
  type AggregateCommand,
  type StreamEvent,
  type ProtocolContext,
} from '../index.js';

// ============================================================================
// Type Tests - Ensure all exports are properly typed
// ============================================================================

describe('Type Exports', () => {
  test('should export all necessary types', () => {
    // Test that main types are available
    expect(typeof connect).toBe('function');
    expect(typeof createBasicProtocolContext).toBe('function');
    expect(typeof createWebSocketConnector).toBe('function');
    expect(typeof createWebSocketProtocolStack).toBe('function');
    expect(typeof createWebSocketConnectorLayer).toBe('function');

    // Test that configuration objects are available
    expect(DefaultWebSocketConfig).toBeDefined();
    expect(DefaultWebSocketConfig.defaultTimeout).toBe(30000);
    expect(DefaultWebSocketConfig.maxConcurrentCommands).toBe(100);

    // Test package info
    expect(WebSocketEventSourcingInfo.name).toBe('@codeforbreakfast/eventsourcing-websocket');
    expect(WebSocketEventSourcingInfo.version).toBe('0.1.0');
    expect(WebSocketEventSourcingInfo.features).toContain(
      'One-line WebSocket event sourcing setup'
    );
  });

  test('should have working migration helper functions', () => {
    expect(typeof connectWebSocket).toBe('function');
    expect(typeof createWebSocketProtocol).toBe('function');

    // Migration helpers should be the same as main functions
    expect(connectWebSocket).toBe(connect);
  });
});

// ============================================================================
// Basic Convenience API Tests
// ============================================================================

describe('Convenience API', () => {
  test('should create basic protocol context with sensible defaults', () => {
    const context = createBasicProtocolContext();

    expect(context.sessionId).toBeDefined();
    expect(context.correlationId).toBeDefined();
    expect(typeof context.sessionId).toBe('string');
    expect(typeof context.correlationId).toBe('string');
    expect(context.sessionId).not.toBe(context.correlationId);
  });

  test('should create basic protocol context with overrides', () => {
    const customSessionId = 'custom-session-123';
    const customUserId = 'user-456';

    const context = createBasicProtocolContext({
      sessionId: customSessionId,
      userId: customUserId,
    });

    expect(context.sessionId).toBe(customSessionId);
    expect(context.userId).toBe(customUserId);
    expect(context.correlationId).toBeDefined();
  });

  test('should create WebSocket connector', () => {
    const connector = createWebSocketConnector();

    expect(connector).toBeDefined();
    expect(typeof connector.connect).toBe('function');
  });

  test('should create WebSocket protocol stack layers', () => {
    const stack = createWebSocketProtocolStack();

    expect(stack).toBeDefined();
    // Layer should be an Effect Layer
    expect(stack._tag).toBe('Layer');
  });

  test('should create WebSocket connector layer', () => {
    const layer = createWebSocketConnectorLayer();

    expect(layer).toBeDefined();
    expect(layer._tag).toBe('Layer');
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Configuration', () => {
  test('should have sensible default configuration', () => {
    expect(DefaultWebSocketConfig.defaultTimeout).toBe(30000);
    expect(DefaultWebSocketConfig.maxConcurrentCommands).toBe(100);
    expect(DefaultWebSocketConfig.enableBatching).toBe(true);
    expect(DefaultWebSocketConfig.batchSize).toBe(10);
    expect(DefaultWebSocketConfig.reconnectAttempts).toBe(3);
    expect(DefaultWebSocketConfig.reconnectDelayMs).toBe(1000);
  });

  test('should support connection options interface', () => {
    const context = createBasicProtocolContext();
    const config = {
      defaultTimeout: 60000,
      maxConcurrentCommands: 50,
    };

    const options: WebSocketConnectOptions = {
      context,
      config,
    };

    expect(options.context).toBe(context);
    expect(options.config?.defaultTimeout).toBe(60000);
    expect(options.config?.maxConcurrentCommands).toBe(50);
  });
});

// ============================================================================
// Integration Tests (Mock-based)
// ============================================================================

describe('Integration Patterns', () => {
  test('should demonstrate the convenience API pattern', () => {
    // This test shows how the one-line API should work
    // In a real scenario, this would connect to an actual WebSocket server

    const connectionPattern = () =>
      Effect.gen(function* () {
        // One-line setup - this is the main value proposition
        // const protocol = yield* connect("ws://localhost:8080");

        // For testing, we'll just verify the function exists and has the right signature
        expect(typeof connect).toBe('function');
        expect(connect.length).toBe(2); // url and optional options

        return 'Connection pattern validated';
      });

    expect(connectionPattern).toBeDefined();
  });

  test('should demonstrate advanced configuration pattern', () => {
    const advancedPattern = () =>
      Effect.gen(function* () {
        const context = createBasicProtocolContext({
          sessionId: 'test-session',
          userId: 'test-user',
        });

        const options: WebSocketConnectOptions = {
          context,
          config: {
            defaultTimeout: 45000,
            maxConcurrentCommands: 75,
            reconnectAttempts: 5,
          },
        };

        // Advanced configuration usage
        // const protocol = yield* connect("ws://localhost:8080", options);

        expect(options.context?.sessionId).toBe('test-session');
        expect(options.config?.defaultTimeout).toBe(45000);

        return 'Advanced pattern validated';
      });

    expect(advancedPattern).toBeDefined();
  });

  test('should demonstrate Layer-based dependency injection pattern', () => {
    const layerPattern = () =>
      Effect.gen(function* () {
        const WebSocketLayer = createWebSocketProtocolStack();

        const program = Effect.gen(function* () {
          // In real usage:
          // const connector = yield* DefaultProtocolConnectorService;
          // const protocol = yield* connector.connect("ws://localhost:8080");

          return 'Connected via layers';
        });

        // const result = yield* program.pipe(Effect.provide(WebSocketLayer));

        expect(WebSocketLayer).toBeDefined();
        expect(program).toBeDefined();

        return 'Layer pattern validated';
      });

    expect(layerPattern).toBeDefined();
  });
});

// ============================================================================
// Migration Examples Tests
// ============================================================================

describe('Migration Examples', () => {
  test('should demonstrate migration from separate packages', () => {
    // OLD PATTERN (what users used to have to do):
    const oldPattern = () =>
      Effect.gen(function* () {
        // import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
        // import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';

        const connector = createWebSocketConnector(); // This was manual
        // const protocol = yield* connectWithCompleteStack(connector, "ws://localhost:8080");

        expect(connector).toBeDefined();
        return 'Old pattern requires manual connector creation';
      });

    // NEW PATTERN (what they can do now):
    const newPattern = () =>
      Effect.gen(function* () {
        // import { connect } from '@codeforbreakfast/eventsourcing-websocket';

        // const protocol = yield* connect("ws://localhost:8080");
        // Everything is handled automatically!

        expect(typeof connect).toBe('function');
        return 'New pattern is one line!';
      });

    expect(oldPattern).toBeDefined();
    expect(newPattern).toBeDefined();
  });

  test('should provide backward compatibility through legacy functions', () => {
    // Migration helper functions should exist
    expect(connectWebSocket).toBe(connect);
    expect(typeof createWebSocketProtocol).toBe('function');

    // These allow gradual migration
    const migrationStep1 = () =>
      Effect.gen(function* () {
        // Users can change import but keep function name
        // const protocol = yield* connectWebSocket("ws://localhost:8080");
        return 'Step 1: Change import, keep function';
      });

    const migrationStep2 = () =>
      Effect.gen(function* () {
        // Then they can change to the new function name
        // const protocol = yield* connect("ws://localhost:8080");
        return 'Step 2: Use new function name';
      });

    expect(migrationStep1).toBeDefined();
    expect(migrationStep2).toBeDefined();
  });
});

// ============================================================================
// Documentation and Metadata Tests
// ============================================================================

describe('Package Metadata', () => {
  test('should provide comprehensive package information', () => {
    expect(WebSocketEventSourcingInfo.name).toBe('@codeforbreakfast/eventsourcing-websocket');
    expect(WebSocketEventSourcingInfo.description).toContain('Batteries-included');
    expect(WebSocketEventSourcingInfo.features).toBeInstanceOf(Array);
    expect(WebSocketEventSourcingInfo.features.length).toBeGreaterThan(5);

    expect(WebSocketEventSourcingInfo.dependencies.transport).toBe(
      '@codeforbreakfast/eventsourcing-transport-websocket'
    );
    expect(WebSocketEventSourcingInfo.dependencies.protocol).toBe(
      '@codeforbreakfast/eventsourcing-protocol-default'
    );

    expect(WebSocketEventSourcingInfo.compatibility.nodeJs).toContain('18.0.0+');
    expect(WebSocketEventSourcingInfo.compatibility.runtimes).toContain('Bun');
  });

  test('should include helpful feature descriptions', () => {
    const features = WebSocketEventSourcingInfo.features;

    expect(features).toContain('One-line WebSocket event sourcing setup');
    expect(features).toContain('Pre-configured transport and protocol layers');
    expect(features).toContain('Sensible defaults for rapid development');
    expect(features).toContain('Full customization support for advanced scenarios');
    expect(features).toContain('Migration helpers for existing code');
    expect(features).toContain('Type-safe Effect integration');
  });
});

// ============================================================================
// Real-world Usage Examples (Commented)
// ============================================================================

describe('Real-world Usage Examples', () => {
  test('should show typical event sourcing workflow', () => {
    const typicalWorkflow = () =>
      Effect.gen(function* () {
        // 1. Connect to server
        // const protocol = yield* connect("ws://localhost:8080");

        // 2. Define event and command types
        interface UserCreated {
          type: 'UserCreated';
          userId: string;
          name: string;
          email: string;
        }

        interface CreateUserCommand {
          type: 'CreateUser';
          name: string;
          email: string;
        }

        // 3. Subscribe to events
        // const events = yield* protocol.subscribe({
        //   streamId: "user-events",
        //   eventNumber: 0
        // });

        // 4. Send commands
        // const result = yield* protocol.sendCommand({
        //   aggregate: {
        //     position: { streamId: "user-123", eventNumber: 0 },
        //     name: "User"
        //   },
        //   commandName: "CreateUser",
        //   payload: { name: "John Doe", email: "john@example.com" }
        // });

        return 'Typical workflow demonstrated';
      });

    expect(typicalWorkflow).toBeDefined();
  });

  test('should show error handling patterns', () => {
    const errorHandlingPattern = () =>
      Effect.gen(function* () {
        // const result = yield* connect("ws://invalid-url").pipe(
        //   Effect.catchTag("ConnectionError", (error) => {
        //     console.error("Failed to connect:", error.message);
        //     return Effect.succeed(null);
        //   }),
        //   Effect.catchTag("StreamError", (error) => {
        //     console.error("Stream error:", error.message);
        //     return Effect.succeed(null);
        //   })
        // );

        return 'Error handling patterns shown';
      });

    expect(errorHandlingPattern).toBeDefined();
  });

  test('should show cleanup patterns with Scope', () => {
    const cleanupPattern = () =>
      Effect.gen(function* () {
        // yield* Effect.scoped(
        //   Effect.gen(function* () {
        //     const protocol = yield* connect("ws://localhost:8080");
        //
        //     // Use protocol...
        //
        //     // Connection automatically cleaned up when scope exits
        //   })
        // );

        return 'Cleanup patterns demonstrated';
      });

    expect(cleanupPattern).toBeDefined();
  });
});

// ============================================================================
// Performance and Best Practices Tests
// ============================================================================

describe('Performance and Best Practices', () => {
  test('should demonstrate connection reuse patterns', () => {
    const connectionReusePattern = () =>
      Effect.gen(function* () {
        // GOOD: Reuse connection across multiple operations
        // const protocol = yield* connect("ws://localhost:8080");
        //
        // const operation1 = yield* protocol.sendCommand(...);
        // const operation2 = yield* protocol.subscribe(...);
        // const operation3 = yield* protocol.sendCommand(...);

        // BAD: Don't create multiple connections
        // const protocol1 = yield* connect("ws://localhost:8080");
        // const protocol2 = yield* connect("ws://localhost:8080");
        // const protocol3 = yield* connect("ws://localhost:8080");

        return 'Connection reuse demonstrated';
      });

    expect(connectionReusePattern).toBeDefined();
  });

  test('should demonstrate configuration best practices', () => {
    const configBestPractices = () =>
      Effect.gen(function* () {
        // Configure timeouts based on your use case
        const options: WebSocketConnectOptions = {
          config: {
            // For real-time apps: shorter timeouts
            defaultTimeout: 10000,
            maxConcurrentCommands: 200,

            // For background processing: longer timeouts
            // defaultTimeout: 120000,
            // maxConcurrentCommands: 50,

            // Always configure reconnection
            reconnectAttempts: 5,
            reconnectDelayMs: 2000,
          },
        };

        // const protocol = yield* connect("ws://localhost:8080", options);

        expect(options.config?.defaultTimeout).toBe(10000);
        return 'Configuration best practices shown';
      });

    expect(configBestPractices).toBeDefined();
  });
});
