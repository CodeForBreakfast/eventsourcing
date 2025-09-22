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
 * Lifecycle is managed via Effect's Scope - when the scope closes,
 * the transport disconnects automatically via acquireRelease.
 */
export interface Transport<TMessage extends TransportMessage = TransportMessage> {
  // Connection state monitoring
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;

  // Message operations
  readonly publish: (message: TMessage) => Effect.Effect<void, TransportError, never>;
  readonly subscribe: (
    filter?: (message: TMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TMessage, never, never>, TransportError, never>;
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
export interface ConnectorInterface<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<Transport<TMessage>, ConnectionError, Scope.Scope>;
}

// ============================================================================
// Service Definitions using Effect.Tag
// ============================================================================

/**
 * Service tag for Client Transport Connector.
 * Creates connections to transport servers.
 */
export interface Connector extends ConnectorInterface {}

export class Connector extends Effect.Tag('@transport/Client.Connector')<
  Connector,
  ConnectorInterface
>() {}

/**
 * Connected transport service for testing and dependency injection
 */
export interface ConnectedTransport extends Transport {}

export class ConnectedTransport extends Effect.Tag('@transport/Client.ConnectedTransport')<
  ConnectedTransport,
  Transport
>() {}
