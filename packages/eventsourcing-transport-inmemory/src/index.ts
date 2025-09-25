/**
 * @codeforbreakfast/eventsourcing-transport-inmemory
 *
 * Pure functional in-memory transport implementation for event sourcing.
 * High-performance message transport using in-memory queues and channels.
 *
 * This package provides a fast in-memory transport that implements
 * the transport contracts without any external dependencies. Each server
 * is completely isolated with zero global state, perfect for testing and applications.
 */

import {
  InMemoryAcceptor,
  type InMemoryServer,
  type InMemoryConnector,
} from './lib/inmemory-transport';

// Main transport implementation
export { InMemoryAcceptor };

// New pure functional types
export type { InMemoryServer };
export type { InMemoryConnector };

// Re-export transport contracts for convenience
export type {
  TransportMessage,
  ConnectionState,
  TransportError,
  ConnectionError,
  MessageParseError,
  MessageId,
  TransportId,
} from '@codeforbreakfast/eventsourcing-transport';

// Re-export client and server namespaces
export { Client, Server } from '@codeforbreakfast/eventsourcing-transport';
