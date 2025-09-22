/**
 * @codeforbreakfast/eventsourcing-transport-websocket
 *
 * WebSocket transport implementation for event sourcing.
 * Protocol-agnostic message transport over WebSocket connections.
 *
 * This package provides a minimal WebSocket transport that implements
 * the transport contracts without any event sourcing domain concepts.
 */

// Main transport implementation and layer
export { WebSocketConnector, WebSocketTransportLive } from './lib/websocket-transport.js';

// Re-export transport contracts for convenience
export type {
  TransportMessage,
  ConnectionState,
  TransportError,
  ConnectionError,
  MessageParseError,
  MessageId,
  TransportId,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// Re-export client namespace
export { Client } from '@codeforbreakfast/eventsourcing-transport-contracts';
