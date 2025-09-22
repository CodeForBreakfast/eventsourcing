/**
 * Event Sourcing Protocol Messages
 *
 * Transport-agnostic message schemas for event sourcing protocols.
 * These schemas define the structure of messages that flow between
 * clients and servers, regardless of the underlying transport.
 */

import { Schema } from 'effect';
import { EventStreamPosition as EventStreamPositionSchema } from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Base Protocol Message Types
// ============================================================================

/**
 * Base protocol message with common fields.
 * All protocol messages extend this base structure.
 */
export const BaseProtocolMessage = Schema.Struct({
  id: Schema.String,
  timestamp: Schema.String, // ISO string
  correlationId: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

// ============================================================================
// Client-to-Server Messages
// ============================================================================

/**
 * Subscribe to an event stream from a specific position.
 */
export const SubscribeMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('subscribe'),
  streamId: Schema.String,
  fromPosition: Schema.optional(Schema.Number), // eventNumber to start from
  includeMetadata: Schema.optional(Schema.Boolean),
  batchSize: Schema.optional(Schema.Number),
});

/**
 * Unsubscribe from an event stream.
 */
export const UnsubscribeMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('unsubscribe'),
  streamId: Schema.String,
});

/**
 * Send a command to an aggregate.
 */
export const CommandMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('command'),
  aggregate: Schema.Struct({
    position: EventStreamPositionSchema,
    name: Schema.String,
  }),
  commandName: Schema.String,
  payload: Schema.Unknown,
  expectedVersion: Schema.optional(Schema.Number), // Optimistic concurrency control
});

/**
 * Ping message for connection health checks.
 */
export const PingMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('ping'),
});

// ============================================================================
// Server-to-Client Messages
// ============================================================================

/**
 * Event message delivered to subscribers.
 */
export const EventMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('event'),
  streamId: Schema.String,
  eventNumber: Schema.Number,
  position: Schema.Number, // Global position for ordering
  eventType: Schema.String,
  event: Schema.Unknown,
  eventMetadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

/**
 * Command processing result.
 */
export const CommandResultMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('command_result'),
  success: Schema.Boolean,
  position: Schema.optional(EventStreamPositionSchema),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
      code: Schema.optional(Schema.String),
      details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
    })
  ),
});

/**
 * Subscription acknowledgment with current stream information.
 */
export const SubscriptionAckMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('subscription_ack'),
  streamId: Schema.String,
  currentPosition: EventStreamPositionSchema,
  isLive: Schema.Boolean, // Whether we're caught up to live events
});

/**
 * Subscription ended notification.
 */
export const SubscriptionEndMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('subscription_end'),
  streamId: Schema.String,
  reason: Schema.optional(Schema.String),
});

/**
 * Pong response to ping.
 */
export const PongMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('pong'),
});

/**
 * Server error message.
 */
export const ErrorMessage = Schema.Struct({
  ...BaseProtocolMessage.fields,
  type: Schema.Literal('error'),
  error: Schema.Struct({
    message: Schema.String,
    code: Schema.optional(Schema.String),
    details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }),
});

// ============================================================================
// Union Types for All Messages
// ============================================================================

/**
 * All client-to-server protocol messages.
 */
export const ClientMessage = Schema.Union(
  SubscribeMessage,
  UnsubscribeMessage,
  CommandMessage,
  PingMessage
);

export type ClientMessage = Schema.Schema.Type<typeof ClientMessage>;

/**
 * All server-to-client protocol messages.
 */
export const ServerMessage = Schema.Union(
  EventMessage,
  CommandResultMessage,
  SubscriptionAckMessage,
  SubscriptionEndMessage,
  PongMessage,
  ErrorMessage
);

export type ServerMessage = Schema.Schema.Type<typeof ServerMessage>;

/**
 * Any protocol message (bidirectional).
 */
export const ProtocolMessage = Schema.Union(ClientMessage, ServerMessage);

export type ProtocolMessage = Schema.Schema.Type<typeof ProtocolMessage>;

// ============================================================================
// Message Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if a message is a client message.
 */
export const isClientMessage = (message: ProtocolMessage): message is ClientMessage => {
  return ['subscribe', 'unsubscribe', 'command', 'ping'].includes(message.type);
};

/**
 * Type guard to check if a message is a server message.
 */
export const isServerMessage = (message: ProtocolMessage): message is ServerMessage => {
  return [
    'event',
    'command_result',
    'subscription_ack',
    'subscription_end',
    'pong',
    'error',
  ].includes(message.type);
};

/**
 * Extract message type as a literal string.
 */
export const getMessageType = (message: ProtocolMessage): string => message.type;

/**
 * Create a base message with timestamp and ID.
 */
export const createBaseMessage = (correlationId?: string, metadata?: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  ...(correlationId && { correlationId }),
  ...(metadata && { metadata }),
});

// ============================================================================
// Message Factory Functions
// ============================================================================

/**
 * Create a subscribe message.
 */
export const createSubscribeMessage = (
  streamId: string,
  options?: {
    fromPosition?: number;
    includeMetadata?: boolean;
    batchSize?: number;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
) => ({
  ...createBaseMessage(options?.correlationId, options?.metadata),
  type: 'subscribe' as const,
  streamId,
  ...(options?.fromPosition !== undefined && { fromPosition: options.fromPosition }),
  ...(options?.includeMetadata !== undefined && { includeMetadata: options.includeMetadata }),
  ...(options?.batchSize !== undefined && { batchSize: options.batchSize }),
});

/**
 * Create a command message.
 */
export const createCommandMessage = (
  aggregate: { position: any; name: string },
  commandName: string,
  payload: unknown,
  options?: {
    expectedVersion?: number;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
) => ({
  ...createBaseMessage(options?.correlationId, options?.metadata),
  type: 'command' as const,
  aggregate,
  commandName,
  payload,
  ...(options?.expectedVersion !== undefined && { expectedVersion: options.expectedVersion }),
});

/**
 * Create an event message.
 */
export const createEventMessage = (
  streamId: string,
  eventNumber: number,
  position: number,
  eventType: string,
  event: unknown,
  options?: {
    eventMetadata?: Record<string, unknown>;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
) => ({
  ...createBaseMessage(options?.correlationId, options?.metadata),
  type: 'event' as const,
  streamId,
  eventNumber,
  position,
  eventType,
  event,
  ...(options?.eventMetadata && { eventMetadata: options.eventMetadata }),
});

/**
 * Create a command result message.
 */
export const createCommandResultMessage = (
  success: boolean,
  options?: {
    position?: any;
    error?: { message: string; code?: string; details?: Record<string, unknown> };
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
) => ({
  ...createBaseMessage(options?.correlationId, options?.metadata),
  type: 'command_result' as const,
  success,
  ...(options?.position && { position: options.position }),
  ...(options?.error && { error: options.error }),
});
