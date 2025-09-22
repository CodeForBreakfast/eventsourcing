/**
 * @codeforbreakfast/eventsourcing-transport-contracts
 *
 * Pure transport layer abstractions and contracts for event sourcing.
 * Define transport interfaces that any implementation (WebSocket, HTTP, SSE) can implement.
 *
 * This package contains ONLY the contracts and interfaces - no implementations or testing utilities.
 * For testing utilities, use @codeforbreakfast/eventsourcing-testing-contracts.
 */

// Core transport abstractions
export type {
  TransportMessage,
  ConnectionState,
  ConnectionManager,
  MessagePublisher,
  MessageSubscriber,
  RequestResponse,
  ConnectedTransport,
  TransportConnector,
  TransportConnectorService,
  ConnectedTransportService,
  TransportFeatures,
  AdvancedTransport,
} from './lib/transport-abstractions.js';

// Transport error types
export {
  TransportError,
  ConnectionError,
  MessageParseError,
} from './lib/transport-abstractions.js';
