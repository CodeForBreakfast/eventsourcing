/**
 * Event Sourcing Protocol Types
 *
 * Core types and interfaces that define event sourcing concepts
 * in a transport-agnostic way. These types can be used over any
 * transport implementation (WebSocket, HTTP, SSE, etc.).
 */

import { Effect, Either, Data } from 'effect';
import {
  type EventStreamId,
  type EventStreamPosition,
} from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Event Sourcing Core Types
// ============================================================================

/**
 * A stream event with position, payload, and timestamp.
 * This represents an event at a specific position in an event stream.
 */
export interface StreamEvent<TEvent> {
  readonly position: EventStreamPosition; // Contains streamId and eventNumber
  readonly event: TEvent;
  readonly timestamp: Date;
}

/**
 * Aggregate reference with position and type name.
 * Identifies a specific aggregate instance at a particular version.
 */
export interface Aggregate {
  readonly position: EventStreamPosition; // streamId + eventNumber
  readonly name: string; // aggregate type (e.g., "User", "Order")
}

/**
 * Command targeting a specific aggregate.
 * Contains the aggregate reference, command type, and payload.
 */
export interface AggregateCommand<TPayload = unknown> {
  readonly aggregate: Aggregate;
  readonly commandName: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Event Sourcing Error Types
// ============================================================================

/**
 * Error that occurs during command processing.
 * This is specific to event sourcing domain logic, not transport errors.
 */
export class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string;
  readonly aggregate?: Aggregate;
  readonly commandName?: string;
  readonly details?: Record<string, unknown>;
}> {}

/**
 * Error that occurs during stream subscription or event processing.
 */
export class StreamError extends Data.TaggedError('StreamError')<{
  readonly message: string;
  readonly streamId?: EventStreamId;
  readonly position?: EventStreamPosition;
  readonly cause?: unknown;
}> {}

/**
 * Error that occurs during protocol message serialization/deserialization.
 */
export class ProtocolSerializationError extends Data.TaggedError('ProtocolSerializationError')<{
  readonly message: string;
  readonly messageType?: string;
  readonly rawData?: unknown;
}> {}

// ============================================================================
// Command Result Types
// ============================================================================

/**
 * Result of command processing.
 * Either succeeds with the new event stream position,
 * or fails with a command error.
 */
export type CommandResult = Either.Either<EventStreamPosition, CommandError>;

/**
 * Async command processing result.
 * Commands are processed asynchronously and may fail.
 */
export type AsyncCommandResult = Effect.Effect<CommandResult, never, never>;

// ============================================================================
// Stream Subscription Types
// ============================================================================

/**
 * Stream subscription options for controlling event delivery.
 */
export interface StreamSubscriptionOptions {
  readonly fromPosition?: EventStreamPosition;
  readonly includeMetadata?: boolean;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
}

/**
 * Stream subscription state information.
 */
export interface StreamSubscription {
  readonly streamId: EventStreamId;
  readonly currentPosition: EventStreamPosition;
  readonly isActive: boolean;
  readonly subscribedAt: Date;
}

// ============================================================================
// Protocol Context Types
// ============================================================================

/**
 * Context information for protocol operations.
 * Provides session, authentication, and tracing information.
 */
export interface ProtocolContext {
  readonly sessionId?: string;
  readonly userId?: string;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Request context that combines protocol context with timing information.
 */
export interface RequestContext extends ProtocolContext {
  readonly requestId: string;
  readonly timestamp: Date;
  readonly timeoutMs?: number;
}
