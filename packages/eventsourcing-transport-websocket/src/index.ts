/**
 * @codeforbreakfast/eventsourcing-transport-websocket
 *
 * WebSocket transport implementation for event sourcing.
 * Protocol-agnostic message transport over WebSocket connections.
 *
 * This package provides a minimal WebSocket transport that implements
 * the transport contracts without any event sourcing domain concepts.
 */

// Main transport implementation
export {
  WebSocketTransport,
  WebSocketConnector,
  WEBSOCKET_FEATURES,
} from './lib/websocket-transport.js';

// Re-export transport contracts for convenience
export type {
  TransportMessage,
  ConnectionState,
  ConnectedTransport,
  TransportConnector,
  TransportFeatures,
  AdvancedTransport,
  TransportError,
  ConnectionError,
  MessageParseError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
