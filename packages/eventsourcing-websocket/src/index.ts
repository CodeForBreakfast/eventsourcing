/**
 * @codeforbreakfast/eventsourcing-websocket
 *
 * Batteries-included WebSocket event sourcing package.
 * Complete WebSocket transport with default protocol for rapid development.
 *
 * This package combines the WebSocket transport and default protocol packages
 * into a single, easy-to-use API that gets you up and running with event sourcing
 * over WebSocket in seconds.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { connect } from '@codeforbreakfast/eventsourcing-websocket';
 *
 * // One line to connect and start using event sourcing
 * const protocol = yield* connect("ws://localhost:8080");
 *
 * // Subscribe to events
 * const events = yield* protocol.subscribe({ streamId: "user-stream", eventNumber: 0 });
 *
 * // Send commands
 * const result = yield* protocol.sendCommand({
 *   aggregate: { position: { streamId: "user-123", eventNumber: 0 }, name: "User" },
 *   commandName: "CreateUser",
 *   payload: { name: "John Doe" }
 * });
 * ```
 */

// ============================================================================
// Main Convenience API
// ============================================================================

// Primary convenience functions
export {
  connect,
  createBasicProtocolContext,
  createWebSocketConnector,
  createWebSocketProtocolStack,
  createWebSocketConnectorLayer,
  DefaultWebSocketConfig,
  WebSocketEventSourcingInfo,
  // Migration helpers
  connectWebSocket,
  createWebSocketProtocol,
  // Types
  type WebSocketConnectOptions,
} from './lib/index.js';

// ============================================================================
// Re-exports from Protocol Package (for convenience)
// ============================================================================

// Core protocol types and interfaces
export type {
  EventSourcingProtocol,
  EventStreamSubscriber,
  CommandDispatcher,
  ProtocolSerializer,
  EventSourcingTransportAdapter,
  EventSourcingProtocolConnector,
  EventSourcingProtocolConnectorInterface,
  AggregateCommand,
  StreamEvent,
  CommandResult,
  AsyncCommandResult,
  StreamSubscriptionOptions,
  StreamSubscription,
  ProtocolContext,
  RequestContext,
  // Convenience type aliases
  Protocol,
  Command,
  Event,
  Result,
} from '@codeforbreakfast/eventsourcing-protocol-default';

// Protocol implementation exports
export {
  DefaultProtocolSerializer,
  createDefaultProtocolSerializer,
  DefaultProtocolSerializerService,
  DefaultProtocolSerializerLive,
  ProtocolStateManager,
  createProtocolStateManager,
  ProtocolStateManagerService,
  ProtocolStateManagerLive,
  DefaultEventSourcingProtocol,
  createDefaultEventSourcingProtocol,
  DefaultEventSourcingProtocolService,
  DefaultTransportAdapter,
  DefaultProtocolConnector,
  createDefaultTransportAdapter,
  createDefaultProtocolConnector,
  DefaultTransportAdapterService,
  DefaultProtocolConnectorService,
  DefaultTransportAdapterLive,
  DefaultProtocolConnectorLive,
  createDefaultProtocolConnectorLayer,
  createCompleteProtocolStack,
  connectWithCompleteStack,
  DefaultProtocolConfig,
  createDefaultProtocol,
  ProtocolImplementationInfo,
  // Protocol utilities
  createProtocolContext,
  createRequestContext,
  withProtocolErrorHandling,
} from '@codeforbreakfast/eventsourcing-protocol-default';

// Protocol error types
export {
  CommandError,
  StreamError,
  ProtocolSerializationError,
} from '@codeforbreakfast/eventsourcing-protocol-default';

// ============================================================================
// Re-exports from Transport Package (for convenience)
// ============================================================================

// Transport implementation
export {
  WebSocketTransport,
  WebSocketConnector,
  WEBSOCKET_FEATURES,
} from '@codeforbreakfast/eventsourcing-transport-websocket';

// Transport types
export type {
  TransportMessage,
  ConnectionState,
  ConnectedTransport,
  TransportConnector,
  TransportFeatures,
  AdvancedTransport,
  TransportError,
  ConnectionError,
  MessageParseError,
} from '@codeforbreakfast/eventsourcing-transport-websocket';

// ============================================================================
// Documentation and Metadata
// ============================================================================

/**
 * Complete feature list of this batteries-included package.
 */
export const Features = [
  'One-line WebSocket event sourcing setup',
  'Pre-configured transport and protocol layers',
  'Sensible defaults for rapid development',
  'Full customization support for advanced scenarios',
  'Migration helpers for existing code',
  'Complete type safety with TypeScript',
  'Effect-based reactive programming',
  'Comprehensive error handling',
  'Connection management and reconnection',
  'Message batching and correlation',
  'Stream subscriptions with position tracking',
  'Command/response patterns',
  'Offline message buffering',
  'Backpressure handling',
] as const;

/**
 * Migration guide for existing users.
 */
export const MigrationGuide = {
  fromSeparatePackages: {
    description: 'Migrating from separate transport and protocol packages',
    before: `
// OLD: Multiple imports and manual setup
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';

const connector = new WebSocketConnector();
const protocol = yield* connectWithCompleteStack(connector, "ws://localhost:8080");
    `,
    after: `
// NEW: Single import and one-line setup
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield* connect("ws://localhost:8080");
    `,
  },
  fromOldWebSocketPackage: {
    description: 'Migrating from deprecated websocket packages',
    before: `
// OLD: Legacy WebSocket event sourcing package
import { connectWebSocketEventSourcing } from '@old/websocket-eventsourcing';

const client = yield* connectWebSocketEventSourcing(url, options);
    `,
    after: `
// NEW: Modern Effect-based package
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield* connect(url, options);
    `,
  },
} as const;

/**
 * Common usage patterns and examples.
 */
export const UsageExamples = {
  basicConnection: `
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield* connect("ws://localhost:8080");
  `,
  withCustomContext: `
import { connect, createBasicProtocolContext } from '@codeforbreakfast/eventsourcing-websocket';

const context = createBasicProtocolContext({
  sessionId: "my-session-id",
  userId: "user-123"
});

const protocol = yield* connect("ws://localhost:8080", { context });
  `,
  withConfiguration: `
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield* connect("ws://localhost:8080", {
  config: {
    defaultTimeout: 60000,
    maxConcurrentCommands: 50,
    reconnectAttempts: 5
  }
});
  `,
  usingLayers: `
import { createWebSocketProtocolStack } from '@codeforbreakfast/eventsourcing-websocket';

const WebSocketLayer = createWebSocketProtocolStack();

const program = Effect.gen(function* () {
  const connector = yield* DefaultProtocolConnectorService;
  const protocol = yield* connector.connect("ws://localhost:8080");

  // Use protocol...
}).pipe(Effect.provide(WebSocketLayer));
  `,
} as const;
