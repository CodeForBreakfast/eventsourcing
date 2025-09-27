/**
 * Client-Side Transport Abstractions
 *
 * Defines transport contracts for client-side operations including connection
 * management and bidirectional message communication using pure functional patterns.
 */

import { Effect, Stream, Scope } from 'effect';
import type { TransportMessage, ConnectionState, TransportError, ConnectionError } from './shared';

// ============================================================================
// Client Transport Types
// ============================================================================

/**
 * A fully connected transport that handles all client-side transport operations.
 * This type can ONLY exist after a successful connection.
 *
 * Transport layer only deals with string payloads - doesn't know about content structure.
 * Lifecycle is managed via Effect's Scope - when the scope closes,
 * the transport disconnects automatically via acquireRelease.
 */
export interface Transport {
  // Connection state monitoring
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;

  // Message operations
  readonly publish: (message: TransportMessage) => Effect.Effect<void, TransportError, never>;
  readonly subscribe: (
    filter?: (message: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never>;
}

/**
 * Service interface for creating client transport connections.
 *
 * The connect method should use Effect.acquireRelease to ensure proper cleanup:
 * - Acquire: establish connection, create transport
 * - Release: disconnect, cleanup resources
 *
 * The Scope requirement ensures the transport is automatically
 * disconnected when the scope closes.
 */
export interface ConnectorInterface {
  readonly connect: (url: string) => Effect.Effect<Transport, ConnectionError, Scope.Scope>;
}

// ============================================================================
// Service Definitions using Effect.Tag
// ============================================================================

/**
 * Service tag for Client Transport Connector.
 * Creates connections to transport servers.
 */
export class Connector extends Effect.Tag('@transport/Client.Connector')<
  Connector,
  ConnectorInterface
>() {}

/**
 * Connected transport service for testing and dependency injection
 */
export class ConnectedTransport extends Effect.Tag('@transport/Client.ConnectedTransport')<
  ConnectedTransport,
  Transport
>() {}
