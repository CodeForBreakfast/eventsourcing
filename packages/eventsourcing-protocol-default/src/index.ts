/**
 * @codeforbreakfast/eventsourcing-protocol-default
 *
 * Default implementation of the event sourcing protocol over any transport.
 * This is the standard protocol implementation that provides message serialization,
 * command correlation, and subscription management.
 *
 * ## Key Components
 *
 * - **DefaultProtocolSerializer**: Handles message serialization/deserialization
 * - **ProtocolStateManager**: Manages subscriptions and pending commands
 * - **DefaultEventSourcingProtocol**: Main protocol implementation
 * - **DefaultTransportAdapter**: Bridges transport to protocol
 * - **DefaultProtocolConnector**: Complete connection factory
 *
 * ## Quick Start
 *
 * ```typescript
 * import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';
 * import { myTransportConnector } from './my-transport';
 *
 * // Connect and use protocol
 * const protocol = yield* connectWithCompleteStack(
 *   myTransportConnector,
 *   "ws://localhost:8080"
 * );
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
 */

// ============================================================================
// Core Protocol Implementation
// ============================================================================

// Protocol serializer
export {
  DefaultProtocolSerializer,
  createDefaultProtocolSerializer,
  DefaultProtocolSerializerService,
  DefaultProtocolSerializerLive,
  type DefaultProtocolSerializerInterface,
} from './lib/default-protocol-serializer.js';

// State management
export {
  ProtocolStateManager,
  createProtocolStateManager,
  ProtocolStateManagerService,
  ProtocolStateManagerLive,
  type ProtocolStateManagerInterface,
} from './lib/protocol-state-manager.js';

// Main protocol implementation
export {
  DefaultEventSourcingProtocol,
  createDefaultEventSourcingProtocol,
  DefaultEventSourcingProtocolService,
  type DefaultEventSourcingProtocolInterface,
} from './lib/default-event-sourcing-protocol.js';

// Transport adapter and connector
export {
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
  type DefaultTransportAdapterInterface,
  type DefaultProtocolConnectorInterface,
} from './lib/default-transport-adapter.js';

// ============================================================================
// Re-exports from Protocol Contracts (for convenience)
// ============================================================================

// Re-export commonly used types and utilities from protocol contracts
export {
  type EventSourcingProtocol,
  type EventStreamSubscriber,
  type CommandDispatcher,
  type ProtocolSerializer,
  type EventSourcingTransportAdapter,
  type EventSourcingProtocolConnector,
  type EventSourcingProtocolConnectorInterface,
  type AggregateCommand,
  type StreamEvent,
  type CommandResult,
  type AsyncCommandResult,
  type StreamSubscriptionOptions,
  type StreamSubscription,
  type ProtocolContext,
  type RequestContext,
  createProtocolContext,
  createRequestContext,
  withProtocolErrorHandling,
  CommandError,
  StreamError,
  ProtocolSerializationError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// ============================================================================
// Preset Configurations and Convenience Functions
// ============================================================================

/**
 * Default configuration for the protocol implementation.
 */
export const DefaultProtocolConfig = {
  defaultTimeout: 30000, // 30 seconds
  maxConcurrentCommands: 100,
  enableBatching: true,
  batchSize: 10,
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
} as const;

/**
 * Create a basic protocol context with minimal configuration.
 */
export const createBasicProtocolContext = (overrides?: Partial<ProtocolContext>): ProtocolContext =>
  createProtocolContext({
    sessionId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    ...overrides,
  });

/**
 * Helper to create a protocol with sensible defaults.
 * This is the recommended way to set up a protocol for most use cases.
 */
export const createDefaultProtocol = <TEvent>(
  transportConnector: any, // Import from transport-contracts
  url: string,
  options?: {
    context?: ProtocolContext;
    config?: Partial<typeof DefaultProtocolConfig>;
  }
) => {
  const context = options?.context ?? createBasicProtocolContext();
  const config = { ...DefaultProtocolConfig, ...options?.config };

  return connectWithCompleteStack<TEvent>(transportConnector, url, context);
};

// ============================================================================
// Type Exports for Consumer Convenience
// ============================================================================

/**
 * Main protocol interface that consumers will typically use.
 */
export type { EventSourcingProtocol as Protocol } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * Command interface for sending commands.
 */
export type { AggregateCommand as Command } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * Event interface for receiving events.
 */
export type { StreamEvent as Event } from '@codeforbreakfast/eventsourcing-protocol-contracts';

/**
 * Result type for command operations.
 */
export type { CommandResult as Result } from '@codeforbreakfast/eventsourcing-protocol-contracts';

// ============================================================================
// Documentation Exports
// ============================================================================

/**
 * Protocol implementation status and metadata.
 */
export const ProtocolImplementationInfo = {
  name: '@codeforbreakfast/eventsourcing-protocol-default',
  version: '0.1.0',
  description: 'Default implementation of the event sourcing protocol over any transport',
  features: [
    'Transport-agnostic protocol implementation',
    'JSON message serialization',
    'Command correlation and tracking',
    'Subscription management with position tracking',
    'Automatic error handling and recovery',
    'Type-safe Effect integration',
    'Comprehensive test coverage',
  ],
  compatibility: {
    transports: ['WebSocket', 'HTTP', 'SSE', 'TCP', 'Custom'],
    eventStores: ['PostgreSQL', 'EventStore', 'Custom'],
    frameworks: ['Effect', 'Node.js', 'Bun', 'Browser'],
  },
} as const;
