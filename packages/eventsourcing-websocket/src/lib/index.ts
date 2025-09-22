/**
 * @codeforbreakfast/eventsourcing-websocket
 *
 * Batteries-included WebSocket event sourcing package.
 * Combines WebSocket transport with default protocol for rapid development.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { connect } from '@codeforbreakfast/eventsourcing-websocket';
 *
 * // One-line setup for WebSocket + event sourcing
 * const protocol = yield* connect("ws://localhost:8080");
 *
 * // Subscribe to events
 * const events = yield* protocol.subscribe({ streamId: "user-stream", eventNumber: 0 });
 *
 * // Send commands
 * const result = yield* protocol.sendCommand({
 *   aggregate: { position: { streamId: "user-123", eventNumber: 0 }, name: "User" },
 *   commandName: "CreateUser",
 *   payload: { name: "John" }
 * });
 * ```
 *
 * ## Migration from Old Package
 *
 * ```typescript
 * // OLD: Multiple imports and setup
 * import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
 * import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';
 * const connector = new WebSocketConnector();
 * const protocol = yield* connectWithCompleteStack(connector, url);
 *
 * // NEW: Single import and call
 * import { connect } from '@codeforbreakfast/eventsourcing-websocket';
 * const protocol = yield* connect(url);
 * ```
 */

import { Effect, Scope, Layer } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import {
  connectWithCompleteStack,
  createCompleteProtocolStack,
  createDefaultProtocolConnectorLayer,
  DefaultTransportAdapterLive,
  type ProtocolContext,
  type EventSourcingProtocol,
  createProtocolContext,
} from '@codeforbreakfast/eventsourcing-protocol-default';
import type {
  ConnectionError,
  StreamError,
} from '@codeforbreakfast/eventsourcing-transport-websocket';

// ============================================================================
// Primary Convenience API
// ============================================================================

/**
 * Default configuration for WebSocket event sourcing connections.
 */
export const DefaultWebSocketConfig = {
  defaultTimeout: 30000,
  maxConcurrentCommands: 100,
  enableBatching: true,
  batchSize: 10,
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
} as const;

/**
 * Options for WebSocket connection.
 */
export interface WebSocketConnectOptions {
  readonly context?: ProtocolContext;
  readonly config?: Partial<typeof DefaultWebSocketConfig>;
}

/**
 * Connect to a WebSocket event sourcing server with one line of code.
 * This is the simplest way to get started with WebSocket event sourcing.
 *
 * @param url - WebSocket server URL (e.g., "ws://localhost:8080")
 * @param options - Optional configuration
 * @returns Connected event sourcing protocol
 *
 * @example
 * ```typescript
 * import { connect } from '@codeforbreakfast/eventsourcing-websocket';
 *
 * const protocol = yield* connect("ws://localhost:8080");
 * ```
 */
export const connect = <TEvent = unknown>(
  url: string,
  options?: WebSocketConnectOptions
): Effect.Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope.Scope> => {
  const context = options?.context ?? createBasicProtocolContext();
  const config = { ...DefaultWebSocketConfig, ...options?.config };

  const transportConnector = new WebSocketConnector();
  return connectWithCompleteStack<TEvent>(transportConnector, url, context);
};

/**
 * Create a basic protocol context with sensible defaults.
 */
export const createBasicProtocolContext = (overrides?: Partial<ProtocolContext>): ProtocolContext =>
  createProtocolContext({
    sessionId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    ...overrides,
  });

// ============================================================================
// Advanced Configuration APIs
// ============================================================================

/**
 * Create a pre-configured WebSocket connector for advanced use cases.
 * Use this when you need to customize the transport before connecting.
 *
 * @returns WebSocket transport connector
 *
 * @example
 * ```typescript
 * import { createWebSocketConnector } from '@codeforbreakfast/eventsourcing-websocket';
 * import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';
 *
 * const connector = createWebSocketConnector();
 * const protocol = yield* connectWithCompleteStack(connector, url);
 * ```
 */
export const createWebSocketConnector = () => new WebSocketConnector();

/**
 * Create a complete WebSocket protocol stack as Effect layers.
 * Use this for dependency injection scenarios or when building larger applications.
 *
 * @returns Layer that provides WebSocket protocol stack
 *
 * @example
 * ```typescript
 * import { createWebSocketProtocolStack } from '@codeforbreakfast/eventsourcing-websocket';
 *
 * const WebSocketLayer = createWebSocketProtocolStack();
 *
 * const program = Effect.gen(function* () {
 *   const connector = yield* DefaultProtocolConnectorService;
 *   const protocol = yield* connector.connect("ws://localhost:8080");
 *   // ... use protocol
 * }).pipe(Effect.provide(WebSocketLayer));
 * ```
 */
export const createWebSocketProtocolStack = <TEvent = unknown>() => {
  const transportConnector = new WebSocketConnector();
  return createCompleteProtocolStack<TEvent>(transportConnector);
};

/**
 * Create just the WebSocket connector layer for maximum flexibility.
 * Combine this with other layers from the protocol-default package.
 *
 * @returns Layer that provides WebSocket protocol connector
 */
export const createWebSocketConnectorLayer = <TEvent = unknown>() => {
  const transportConnector = new WebSocketConnector();
  return createDefaultProtocolConnectorLayer<TEvent>(transportConnector);
};

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Legacy connection method for backward compatibility.
 * @deprecated Use `connect()` instead for new code.
 */
export const connectWebSocket = connect;

/**
 * Create protocol with explicit configuration for migration scenarios.
 */
export const createWebSocketProtocol = <TEvent = unknown>(
  url: string,
  options?: WebSocketConnectOptions
) => connect<TEvent>(url, options);

// ============================================================================
// Package Information
// ============================================================================

/**
 * Package implementation information and compatibility matrix.
 */
export const WebSocketEventSourcingInfo = {
  name: '@codeforbreakfast/eventsourcing-websocket',
  version: '0.1.0',
  description: 'Batteries-included WebSocket event sourcing package',
  features: [
    'One-line WebSocket event sourcing setup',
    'Pre-configured transport and protocol layers',
    'Sensible defaults for rapid development',
    'Full customization support for advanced scenarios',
    'Migration helpers for existing code',
    'Type-safe Effect integration',
    'Comprehensive test coverage',
  ],
  dependencies: {
    transport: '@codeforbreakfast/eventsourcing-transport-websocket',
    protocol: '@codeforbreakfast/eventsourcing-protocol-default',
  },
  compatibility: {
    browsers: ['Chrome 60+', 'Firefox 55+', 'Safari 11+', 'Edge 79+'],
    nodeJs: ['18.0.0+'],
    runtimes: ['Node.js', 'Bun', 'Browser'],
    frameworks: ['Effect', 'Express', 'Fastify', 'Next.js', 'Vite'],
  },
} as const;
