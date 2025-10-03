/**
 * Shared Transport Types and Utilities
 *
 * Common types, errors, and utilities used by both client and server transport abstractions.
 * Contains purely functional definitions with no side effects.
 */

import { Data, Brand, Schema, pipe } from 'effect';

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
 * Schema for transport message metadata
 */
export const TransportMetadata = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});
export type TransportMetadata = typeof TransportMetadata.Type;

/**
 * Schema for transport message envelope
 * Transport layer only validates the envelope structure
 * Payload is always a serialized JSON string - transport doesn't care what's inside
 */
export const TransportMessage = Schema.Struct({
  id: pipe(Schema.String, Schema.brand('MessageId')),
  type: Schema.String,
  payload: Schema.String, // Always a JSON string - transport doesn't parse it
  metadata: Schema.optionalWith(TransportMetadata, { default: () => ({}) }),
});
export type TransportMessage = typeof TransportMessage.Type;

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
 * Creates a TransportMessage with validated structure
 * Note: payload must already be a JSON string - this function doesn't serialize it
 */
export const makeTransportMessage = (
  id: string,
  type: string,
  payload: string,
  metadata?: Readonly<Record<string, unknown>>
): TransportMessage => ({
  id: MessageId(id),
  type,
  payload,
  metadata: metadata ?? {},
});

/**
 * Validates an unknown value as a TransportMessage
 * Returns Either with validation errors or the valid message
 */
export const parseTransportMessage = Schema.decodeUnknown(TransportMessage);

/**
 * Encodes a TransportMessage to a plain object for serialization
 */
export const encodeTransportMessage = Schema.encode(TransportMessage);
