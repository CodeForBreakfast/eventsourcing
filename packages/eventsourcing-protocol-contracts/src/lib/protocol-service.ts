/**
 * Event Sourcing Protocol Service Abstractions
 *
 * Transport-agnostic service interfaces for event sourcing protocols.
 * These interfaces define how event sourcing operations should work
 * regardless of the underlying transport implementation.
 */

import { Effect, Stream, Scope } from 'effect';
import {
  type TransportConnector,
  type ConnectedTransport,
  type TransportMessage,
  type ConnectionError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import { type EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

import {
  type StreamEvent,
  type Aggregate,
  type AggregateCommand,
  type CommandResult,
  type AsyncCommandResult,
  type StreamSubscriptionOptions,
  type StreamSubscription,
  type ProtocolContext,
  type RequestContext,
  CommandError,
  StreamError,
  ProtocolSerializationError,
} from './protocol-types.js';

import {
  type ProtocolMessage,
  type ClientMessage,
  type ServerMessage,
} from './protocol-messages.js';

// ============================================================================
// Event Sourcing Protocol Operations
// ============================================================================

/**
 * Stream subscription interface for event sourcing.
 * Provides type-safe event streaming with position tracking.
 */
export interface EventStreamSubscriber<TEvent> {
  readonly subscribe: (
    position: EventStreamPosition,
    options?: StreamSubscriptionOptions
  ) => Effect.Effect<Stream.Stream<StreamEvent<TEvent>, StreamError, never>, StreamError, never>;

  readonly getActiveSubscriptions: () => Effect.Effect<readonly StreamSubscription[], never, never>;

  readonly unsubscribe: (streamId: string) => Effect.Effect<void, StreamError, never>;
}

/**
 * Command sending interface for event sourcing.
 * Provides type-safe command dispatch with result tracking.
 */
export interface CommandDispatcher {
  readonly sendCommand: <TPayload>(
    command: AggregateCommand<TPayload>,
    context?: RequestContext
  ) => AsyncCommandResult;

  readonly sendCommandBatch: <TPayload>(
    commands: readonly AggregateCommand<TPayload>[],
    context?: RequestContext
  ) => Effect.Effect<readonly CommandResult[], never, never>;
}

/**
 * Protocol message serialization interface.
 * Handles conversion between domain objects and protocol messages.
 */
export interface ProtocolSerializer<TEvent> {
  readonly serializeCommand: <TPayload>(
    command: AggregateCommand<TPayload>,
    context?: RequestContext
  ) => Effect.Effect<ClientMessage, ProtocolSerializationError, never>;

  readonly deserializeEvent: (
    message: ServerMessage
  ) => Effect.Effect<StreamEvent<TEvent>, ProtocolSerializationError, never>;

  readonly serializeSubscription: (
    position: EventStreamPosition,
    options?: StreamSubscriptionOptions,
    context?: RequestContext
  ) => Effect.Effect<ClientMessage, ProtocolSerializationError, never>;

  readonly deserializeCommandResult: (
    message: ServerMessage
  ) => Effect.Effect<CommandResult, ProtocolSerializationError, never>;
}

/**
 * Complete event sourcing protocol interface.
 * Combines all event sourcing operations over a transport.
 */
export interface EventSourcingProtocol<TEvent>
  extends EventStreamSubscriber<TEvent>,
    CommandDispatcher {
  readonly context: ProtocolContext;
  readonly isConnected: () => Effect.Effect<boolean, never, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

// ============================================================================
// Protocol Connection and Transport Bridging
// ============================================================================

/**
 * Adapts a generic transport to event sourcing protocol operations.
 * This is the bridge between transport abstractions and event sourcing concepts.
 */
export interface EventSourcingTransportAdapter<TEvent> {
  readonly adapt: (
    transport: ConnectedTransport<TransportMessage>,
    serializer: ProtocolSerializer<TEvent>,
    context: ProtocolContext
  ) => Effect.Effect<EventSourcingProtocol<TEvent>, never, never>;
}

/**
 * Factory for creating event sourcing protocol connections.
 * Encapsulates the process of connecting to a transport and setting up the protocol.
 */
export interface EventSourcingProtocolConnector<TEvent> {
  readonly connect: (
    url: string,
    context?: ProtocolContext
  ) => Effect.Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope.Scope>;

  readonly createSerializer: () => ProtocolSerializer<TEvent>;
}

// ============================================================================
// Service Tags - Modern Effect Service Pattern
// ============================================================================

/**
 * Service interface for event sourcing protocol connector.
 * Provides connection factory for creating protocol instances.
 */
export interface EventSourcingProtocolConnectorInterface<TEvent = unknown> {
  readonly connect: (
    url: string,
    context?: ProtocolContext
  ) => Effect.Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope.Scope>;
}

/**
 * Service tag for EventSourcingProtocolConnector.
 * Use this to inject protocol connection capabilities.
 */
export class EventSourcingProtocolConnector<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/EventSourcingProtocolConnector'
)<EventSourcingProtocolConnector<TEvent>, EventSourcingProtocolConnectorInterface<TEvent>>() {}

/**
 * Service interface for a connected event sourcing protocol.
 * This is for legacy compatibility and testing scenarios.
 */
export interface EventSourcingProtocolInterface<TEvent = unknown>
  extends EventSourcingProtocol<TEvent> {}

/**
 * Service tag for connected EventSourcingProtocol.
 * Use this for pre-connected protocol instances.
 */
export class EventSourcingProtocolService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/EventSourcingProtocol'
)<EventSourcingProtocolService<TEvent>, EventSourcingProtocolInterface<TEvent>>() {}

// ============================================================================
// Protocol Implementation Helpers
// ============================================================================

/**
 * Configuration for event sourcing protocol behavior.
 */
export interface EventSourcingProtocolConfig {
  readonly defaultTimeout?: number;
  readonly maxConcurrentCommands?: number;
  readonly enableBatching?: boolean;
  readonly batchSize?: number;
  readonly reconnectAttempts?: number;
  readonly reconnectDelayMs?: number;
}

/**
 * Metrics and monitoring interface for protocol operations.
 */
export interface ProtocolMetrics {
  readonly recordCommandSent: (
    commandName: string,
    aggregate: string
  ) => Effect.Effect<void, never, never>;
  readonly recordCommandResult: (
    commandName: string,
    aggregate: string,
    success: boolean,
    durationMs: number
  ) => Effect.Effect<void, never, never>;
  readonly recordEventReceived: (
    eventType: string,
    streamId: string
  ) => Effect.Effect<void, never, never>;
  readonly recordSubscriptionCreated: (streamId: string) => Effect.Effect<void, never, never>;
  readonly recordSubscriptionEnded: (
    streamId: string,
    reason?: string
  ) => Effect.Effect<void, never, never>;
}

/**
 * Optional metrics service tag.
 */
export class ProtocolMetricsService extends Effect.Tag('@eventsourcing/ProtocolMetrics')<
  ProtocolMetricsService,
  ProtocolMetrics
>() {}

// ============================================================================
// Protocol Factory Functions
// ============================================================================

/**
 * Create a basic protocol context with generated IDs.
 */
export const createProtocolContext = (options?: Partial<ProtocolContext>): ProtocolContext => ({
  sessionId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  ...options,
});

/**
 * Create a request context from protocol context.
 */
export const createRequestContext = (
  protocolContext: ProtocolContext,
  options?: {
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  }
): RequestContext => ({
  ...protocolContext,
  requestId: crypto.randomUUID(),
  timestamp: new Date(),
  ...options,
});

/**
 * Utility to wrap transport operations with protocol error handling.
 */
export const withProtocolErrorHandling = <A, E>(operation: Effect.Effect<A, E, never>) =>
  Effect.catchAll(operation, (error) => {
    if (error instanceof CommandError || error instanceof StreamError) {
      return Effect.fail(error);
    }

    // Convert other errors to appropriate protocol errors
    return Effect.fail(
      new StreamError({
        message: `Protocol operation failed: ${String(error)}`,
        cause: error,
      })
    );
  });
