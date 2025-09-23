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
 * const events = yield* protocol.subscribe("user-stream");
 *
 * // Send commands
 * const result = yield* protocol.sendCommand({
 *   id: "cmd-123",
 *   target: "user-123",
 *   name: "CreateUser",
 *   payload: { name: "John" }
 * });
 * ```
 */

import { Effect, Scope, Layer, pipe } from 'effect';
import { WebSocketTransport } from '@codeforbreakfast/eventsourcing-transport-websocket';
import {
  Protocol,
  ProtocolLive,
  type ProtocolService,
} from '@codeforbreakfast/eventsourcing-protocol-default';
import type { TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';

// ============================================================================
// Primary Convenience API
// ============================================================================

export const DefaultWebSocketConfig = {
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
} as const;

/**
 * Options for WebSocket connection.
 */
export interface WebSocketConnectOptions {
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
export const connect = (
  url: string,
  options?: WebSocketConnectOptions
): Effect.Effect<ProtocolService, TransportError, Scope.Scope> =>
  pipe(
    WebSocketTransport.connect(url),
    Effect.flatMap((transport) =>
      pipe(
        ProtocolLive(transport),
        Layer.build(Scope.Scope),
        Effect.map((context) => Effect.runSync(Layer.unsafeGet(context, Protocol)))
      )
    )
  );

/**
 * Create a basic protocol context with sensible defaults.
 * @deprecated Use connect() directly
 */
export const createBasicProtocolContext = () => ({
  sessionId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
});

// ============================================================================
// Advanced Configuration APIs
// ============================================================================

/**
 * Create a pre-configured WebSocket connector for advanced use cases.
 * @deprecated Use WebSocketTransport.connect() directly
 */
export const createWebSocketConnector = () => ({
  connect: WebSocketTransport.connect,
});

/**
 * Create a complete WebSocket protocol stack as Effect layers.
 * Use this for dependency injection scenarios or when building larger applications.
 */
export const createWebSocketProtocolStack = (url: string) =>
  Layer.scoped(
    Protocol,
    pipe(
      WebSocketTransport.connect(url),
      Effect.flatMap((transport) =>
        Effect.succeed({
          sendCommand: Protocol.prototype.sendCommand,
          subscribe: Protocol.prototype.subscribe,
        })
      )
    )
  );

/**
 * Create just the WebSocket connector layer for maximum flexibility.
 */
export const createWebSocketConnectorLayer = (url: string) =>
  Layer.scoped(
    Protocol,
    pipe(
      WebSocketTransport.connect(url),
      Effect.flatMap((transport) => ProtocolLive(transport).pipe(Layer.build(Scope.Scope)))
    )
  );

// ============================================================================
// Migration Support
// ============================================================================

/**
 * Legacy connect function for backward compatibility.
 * @deprecated Use connect() instead
 */
export const connectWebSocket = connect;

/**
 * Legacy function for creating protocol.
 * @deprecated Use connect() instead
 */
export const createWebSocketProtocol = connect;

// ============================================================================
// Type Exports
// ============================================================================

export const WebSocketEventSourcingInfo = {
  name: '@codeforbreakfast/eventsourcing-websocket',
  description: 'Batteries-included WebSocket event sourcing package',
  version: '0.1.0',
} as const;
