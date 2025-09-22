/**
 * @codeforbreakfast/eventsourcing-transport-contracts
 *
 * Pure transport layer abstractions and contracts for event sourcing.
 * Define transport interfaces that any implementation (WebSocket, HTTP, SSE) can implement.
 *
 * This package contains ONLY the contracts and interfaces - no implementations or testing utilities.
 * For testing utilities, use @codeforbreakfast/eventsourcing-testing-contracts.
 */

// Branded types and constructors
export type { TransportId, MessageId } from './lib/transport-abstractions.js';

export {
  TransportId as makeTransportId,
  MessageId as makeMessageId,
} from './lib/transport-abstractions.js';

// Core transport abstractions
export type {
  TransportMessage,
  ConnectionState,
  ConnectedTransport,
  TransportConnectorService,
} from './lib/transport-abstractions.js';

// Service tags (Context.GenericTag for generic support)
export { TransportConnector, ConnectedTransportService } from './lib/transport-abstractions.js';

// Transport error types
export {
  TransportError,
  ConnectionError,
  MessageParseError,
} from './lib/transport-abstractions.js';
