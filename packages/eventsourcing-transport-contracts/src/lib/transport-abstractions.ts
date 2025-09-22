/**
 * Pure Transport Layer Abstractions
 *
 * These interfaces define the contracts for any transport implementation,
 * without any event sourcing domain concepts. They focus purely on
 * message transport, connection management, and stream operations.
 */

import { Effect, Stream, Scope, Data } from 'effect';

// ============================================================================
// Generic Transport Error Types
// ============================================================================

export class TransportError extends Data.TaggedError('TransportError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  readonly message: string;
  readonly url?: string;
  readonly cause?: unknown;
}> {}

export class MessageParseError extends Data.TaggedError('MessageParseError')<{
  readonly message: string;
  readonly rawData?: unknown;
}> {}

// ============================================================================
// Core Transport Interfaces
// ============================================================================

/**
 * Generic message type for transport layer
 */
export interface TransportMessage<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

/**
 * Connection state management
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Connection management operations
 */
export interface ConnectionManager {
  readonly connect: () => Effect.Effect<void, ConnectionError, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
  readonly isConnected: () => Effect.Effect<boolean, never, never>;
  readonly getState: () => Effect.Effect<ConnectionState, never, never>;
}

/**
 * Message publishing operations
 */
export interface MessagePublisher<TMessage extends TransportMessage = TransportMessage> {
  readonly publish: (message: TMessage) => Effect.Effect<void, TransportError, never>;
}

/**
 * Message subscription operations
 */
export interface MessageSubscriber<TMessage extends TransportMessage = TransportMessage> {
  readonly subscribe: (
    filter?: (message: TMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TMessage, never, never>, TransportError, never>;
}

/**
 * Request/Response pattern for transport
 */
export interface RequestResponse<TRequest = unknown, TResponse = unknown> {
  readonly request: (
    request: TRequest,
    timeoutMs?: number
  ) => Effect.Effect<TResponse, TransportError, never>;
}

/**
 * A fully connected transport that combines all transport operations.
 * This type can ONLY exist after a successful connection.
 */
export interface ConnectedTransport<TMessage extends TransportMessage = TransportMessage>
  extends ConnectionManager,
    MessagePublisher<TMessage>,
    MessageSubscriber<TMessage>,
    RequestResponse {}

/**
 * Transport connector - the only way to get a ConnectedTransport.
 * This design makes it impossible to call transport methods before connecting.
 */
export interface TransportConnector<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TMessage>, ConnectionError, Scope.Scope>;
}

// ============================================================================
// Service Interface Definitions
// ============================================================================

/**
 * Service interface for transport connector.
 * Provides a connect function instead of a pre-built transport.
 */
export interface TransportConnectorService<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TMessage>, ConnectionError, Scope.Scope>;
}

/**
 * Legacy service interface that provides pre-connected transport.
 * This is primarily for testing and simple use cases.
 * For production code, prefer using TransportConnectorService.
 */
export interface ConnectedTransportService<TMessage extends TransportMessage = TransportMessage>
  extends ConnectedTransport<TMessage> {}

// ============================================================================
// Optional Transport Features
// ============================================================================

/**
 * Advanced features that a transport may optionally support
 */
export interface TransportFeatures {
  readonly supportsReconnection?: boolean;
  readonly supportsOfflineBuffering?: boolean;
  readonly supportsBackpressure?: boolean;
  readonly guaranteesOrdering?: boolean;
  readonly supportsMultiplexing?: boolean;
  readonly supportsBatching?: boolean;
  readonly supportsCompression?: boolean;
}

/**
 * Extended transport interface with optional advanced features
 */
export interface AdvancedTransport<TMessage extends TransportMessage = TransportMessage>
  extends ConnectedTransport<TMessage> {
  readonly features: TransportFeatures;

  // Reconnection support
  readonly simulateDisconnect?: () => Effect.Effect<void, never, never>;
  readonly simulateReconnect?: () => Effect.Effect<void, never, never>;

  // Buffering support
  readonly getBufferedMessageCount?: () => Effect.Effect<number, never, never>;
  readonly flushBuffer?: () => Effect.Effect<void, TransportError, never>;

  // Batching support
  readonly publishBatch?: (
    messages: readonly TMessage[]
  ) => Effect.Effect<void, TransportError, never>;
}
