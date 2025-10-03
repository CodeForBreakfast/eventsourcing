/**
 * @codeforbreakfast/eventsourcing-transport
 *
 * Pure transport layer abstractions and contracts for event sourcing.
 * Define transport interfaces that any implementation (WebSocket, HTTP, SSE) can implement.
 *
 * This package contains ONLY the contracts and interfaces - no implementations or testing utilities.
 * For testing utilities, use @codeforbreakfast/eventsourcing-testing-contracts.
 */

// ============================================================================
// Shared Types and Utilities
// ============================================================================

export type { TransportId, MessageId, TransportMessage, ConnectionState } from './lib/shared';

export {
  TransportId as makeTransportId,
  MessageId as makeMessageId,
  makeTransportMessage,
  TransportMessage as TransportMessageSchema,
} from './lib/shared';

export { TransportError, ConnectionError, MessageParseError } from './lib/shared';

// ============================================================================
// Client Namespace
// ============================================================================

export * as Client from './lib/client';

// ============================================================================
// Server Namespace
// ============================================================================

export * as Server from './lib/server';
