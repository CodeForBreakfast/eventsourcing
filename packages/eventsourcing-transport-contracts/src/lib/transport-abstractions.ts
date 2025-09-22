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
 * A fully connected transport that handles all transport operations.
 * This type can ONLY exist after a successful connection.
 *
 * Lifecycle is managed via Effect's Scope - when the scope closes,
 * the transport disconnects automatically via acquireRelease.
 */
export interface ConnectedTransport<TMessage extends TransportMessage = TransportMessage> {
  // Connection state monitoring
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;

  // Message operations
  readonly publish: (message: TMessage) => Effect.Effect<void, TransportError, never>;
  readonly subscribe: (
    filter?: (message: TMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TMessage, never, never>, TransportError, never>;
}

// ============================================================================
// Service Definitions
// ============================================================================

/**
 * Service interface for creating transport connections.
 *
 * The connect method should use Effect.acquireRelease to ensure proper cleanup:
 * - Acquire: establish connection, create transport
 * - Release: disconnect, cleanup resources
 *
 * The Scope requirement ensures the transport is automatically
 * disconnected when the scope closes.
 */
export interface TransportConnectorInterface<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TMessage>, ConnectionError, Scope.Scope>;
}

/**
 * Service tag for TransportConnector.
 * Uses Context.GenericTag to support generic types properly.
 */
export const TransportConnector = Context.GenericTag<TransportConnectorInterface>(
  '@transport/TransportConnector'
);

/**
 * Connected transport service for testing and dependency injection
 */
export interface ConnectedTransportInterface<TMessage extends TransportMessage = TransportMessage>
  extends ConnectedTransport<TMessage> {}

export const ConnectedTransportService = Context.GenericTag<ConnectedTransportInterface>(
  '@transport/ConnectedTransport'
);
