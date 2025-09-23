/**
 * @codeforbreakfast/eventsourcing-transport-inmemory
 *
 * In-memory transport implementation for event sourcing.
 * High-performance message transport using in-memory queues and channels.
 *
 * This package provides a fast in-memory transport that implements
 * the transport contracts without any external dependencies. Perfect
 * for testing and single-process applications.
 */

import { Layer } from 'effect';
import { Client } from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  InMemoryConnector,
  InMemoryAcceptor,
  InMemoryRegistry,
  InMemoryRegistryLive,
  InMemoryConnectorRaw,
  resetInMemoryRegistry,
} from './lib/inmemory-transport';

// Main transport implementation and layer
export { InMemoryConnector, InMemoryAcceptor };

// Advanced exports for dependency injection
export { InMemoryRegistry, InMemoryRegistryLive, InMemoryConnectorRaw };

// Testing utilities
export { resetInMemoryRegistry };

// Layer for Effect.Tag usage
export const InMemoryTransportLive = Layer.succeed(Client.Connector, InMemoryConnector);

// Configuration type
export interface InMemoryServerConfig {
  readonly serverId: string;
}

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

// Re-export client and server namespaces
export { Client, Server } from '@codeforbreakfast/eventsourcing-transport-contracts';
