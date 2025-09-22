/**
 * Shared Transport Types and Utilities
 *
 * Common types, errors, and utilities used by both client and server transport abstractions.
 * Contains purely functional definitions with no side effects.
 */

import { Data, Brand } from 'effect';

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a TransportMessage with a branded MessageId
 */
export const makeTransportMessage = <TPayload = unknown>(
  id: string,
  type: string,
  payload: TPayload,
  metadata?: Record<string, unknown>
): TransportMessage<TPayload> => ({
  id: MessageId(id),
  type,
  payload,
  metadata: metadata ?? {},
});
