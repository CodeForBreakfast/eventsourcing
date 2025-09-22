/**
 * @codeforbreakfast/eventsourcing-transport-contracts
 *
 * Pure transport layer abstractions and contracts for event sourcing.
 * Define transport interfaces that any implementation (WebSocket, HTTP, SSE) can implement.
 *
 * This package contains ONLY the contracts and testing utilities - no implementations.
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

// Transport testing utilities
export type { TransportTestContext } from './lib/transport-testing.js';

export { runTransportContractTests } from './lib/transport-testing.js';
