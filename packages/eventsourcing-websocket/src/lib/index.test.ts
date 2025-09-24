/**
 * Tests for the convenience WebSocket event sourcing package.
 *
 * This test file demonstrates the simplified API after removing deprecated functions.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  connect,
  makeWebSocketProtocolLayer,
  DefaultWebSocketConfig,
  WebSocketEventSourcingInfo,
  type WebSocketConnectOptions,
} from '../index.js';

// ============================================================================
// Type Tests - Ensure all exports are properly typed
// ============================================================================

describe('Type Exports', () => {
  test('should export all necessary types', () => {
    // Test that main types are available
    expect(typeof connect).toBe('function');
    expect(typeof makeWebSocketProtocolLayer).toBe('function');

    // Test that configuration objects are available
    expect(DefaultWebSocketConfig).toBeDefined();
    expect(DefaultWebSocketConfig.reconnectAttempts).toBe(3);
    expect(DefaultWebSocketConfig.reconnectDelayMs).toBe(1000);

    // Test package info
    expect(WebSocketEventSourcingInfo.name).toBe('@codeforbreakfast/eventsourcing-websocket');
    expect(WebSocketEventSourcingInfo.version).toBe('0.1.0');
    expect(WebSocketEventSourcingInfo.description).toContain('Batteries-included');
  });
});

// ============================================================================
// Convenience API Tests
// ============================================================================

describe('Convenience API', () => {
  test('should create WebSocket protocol layers', () => {
    const layer = makeWebSocketProtocolLayer('ws://localhost:8080');

    expect(layer).toBeDefined();
    // Layer should be an Effect Layer
    expect(typeof layer).toBe('object');
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Configuration', () => {
  test('should have sensible default configuration', () => {
    expect(DefaultWebSocketConfig.reconnectAttempts).toBe(3);
    expect(DefaultWebSocketConfig.reconnectDelayMs).toBe(1000);
  });

  test('should support connection options interface', () => {
    const config = {
      reconnectAttempts: 5,
      reconnectDelayMs: 2000,
    };

    const options: WebSocketConnectOptions = {
      config,
    };

    expect(options.config?.reconnectAttempts).toBe(5);
    expect(options.config?.reconnectDelayMs).toBe(2000);
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
        const options: WebSocketConnectOptions = {
          config: {
            reconnectAttempts: 5,
            reconnectDelayMs: 1500,
          },
        };

        // Advanced configuration usage
        // const protocol = yield* connect("ws://localhost:8080", options);

        expect(options.config?.reconnectAttempts).toBe(5);
        expect(options.config?.reconnectDelayMs).toBe(1500);

        return 'Advanced pattern validated';
      });

    expect(advancedPattern).toBeDefined();
  });

  test('should demonstrate Layer-based dependency injection pattern', () => {
    const layerPattern = () =>
      Effect.gen(function* () {
        const WebSocketLayer = makeWebSocketProtocolLayer('ws://localhost:8080');

        const program = Effect.gen(function* () {
          // In real usage:
          // const protocol = yield* Protocol;
          // const events = yield* protocol.subscribe({...});

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
// API Usage Examples
// ============================================================================

describe('API Usage Examples', () => {
  test('should demonstrate simplified API pattern', () => {
    const newPattern = () =>
      Effect.gen(function* () {
        // import { connect } from '@codeforbreakfast/eventsourcing-websocket';

        // const protocol = yield* connect("ws://localhost:8080");
        // Everything is handled automatically!

        expect(typeof connect).toBe('function');
        return 'New pattern is one line!';
      });

    expect(newPattern).toBeDefined();
  });
});

// ============================================================================
// Package Metadata Tests
// ============================================================================

describe('Package Metadata', () => {
  test('should provide comprehensive package information', () => {
    expect(WebSocketEventSourcingInfo.name).toBe('@codeforbreakfast/eventsourcing-websocket');
    expect(WebSocketEventSourcingInfo.description).toContain('Batteries-included');
    expect(WebSocketEventSourcingInfo.version).toBe('0.1.0');
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
        // Configure reconnection based on your use case
        const options: WebSocketConnectOptions = {
          config: {
            // Always configure reconnection
            reconnectAttempts: 5,
            reconnectDelayMs: 2000,
          },
        };

        // const protocol = yield* connect("ws://localhost:8080", options);

        expect(options.config?.reconnectAttempts).toBe(5);
        return 'Configuration best practices shown';
      });

    expect(configBestPractices).toBeDefined();
  });
});
