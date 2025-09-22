/**
 * Pure Transport Layer Abstractions
 *
 * These interfaces define the contracts for any transport implementation,
 * without any event sourcing domain concepts. They focus purely on
 * message transport, connection management, and stream operations.
 */

import { Effect, Stream, Scope, Data, Brand, Context } from 'effect';

// ============================================================================
// Branded Types
// ============================================================================

export type TransportId = string & Brand.Brand<'TransportId'>;
export const TransportId = Brand.nominal<TransportId>();

export type MessageId = string & Brand.Brand<'MessageId'>;
export const MessageId = Brand.nominal<MessageId>();

// ============================================================================
// Transport Error Types
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
// Core Transport Types
// ============================================================================

/**
 * Generic message type for transport layer
 */
export interface TransportMessage<TPayload = unknown> {
  readonly id: MessageId;
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

/**
 * Connection state using Effect's built-in state management concepts
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
 * Message subscription operations using Effect's Stream
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

// ============================================================================
// Service Definitions
// ============================================================================

/**
 * Service interface for creating transport connections.
 * Implementations handle protocol negotiation and connection setup.
 */
export interface TransportConnectorService<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TMessage>, ConnectionError, Scope.Scope>;
}

/**
 * Service tag for TransportConnector.
 * Use Context.GenericTag to support generic types.
 */
export const TransportConnector = Context.GenericTag<TransportConnectorService>(
  '@transport/TransportConnector'
);

/**
 * Connected transport service for testing and dependency injection
 */
export const ConnectedTransportService = Context.GenericTag<ConnectedTransport>(
  '@transport/ConnectedTransport'
);
