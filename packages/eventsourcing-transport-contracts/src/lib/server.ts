/**
 * Server-Side Transport Abstractions
 *
 * Defines transport contracts for server-side operations including client connection
 * management, broadcasting, and server lifecycle using pure functional patterns.
 */

import { Effect, Stream, Scope, Data, Brand } from 'effect';
import type { TransportMessage, TransportError } from './shared';
import type { Transport as ClientTransport } from './client';

// ============================================================================
// Server-Specific Branded Types
// ============================================================================

export type ClientId = string & Brand.Brand<'ClientId'>;
export const ClientId = Brand.nominal<ClientId>();

// ============================================================================
// Server-Specific Error Types
// ============================================================================

export class ServerStartError extends Data.TaggedError('ServerStartError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Server Transport Types
// ============================================================================

/**
 * Represents a single client connection on the server.
 * Each client has a Transport for bidirectional communication.
 */
export interface ClientConnection<TMessage extends TransportMessage = TransportMessage> {
  readonly clientId: ClientId;
  readonly transport: ClientTransport<TMessage>;
  readonly connectedAt: Date;
  readonly metadata: Record<string, unknown>;
}

/**
 * Server-side transport that manages multiple client connections.
 * Each client gets a Transport for bidirectional communication.
 * Lifecycle is managed via Scope - when the scope closes, the server shuts down.
 */
export interface Transport<TMessage extends TransportMessage = TransportMessage> {
  // Accept new client connections
  readonly connections: Stream.Stream<ClientConnection<TMessage>, never, never>;

  // Broadcasting to all connected clients
  readonly broadcast: (message: TMessage) => Effect.Effect<void, TransportError, never>;
}

/**
 * Service interface for creating transport servers.
 *
 * Uses Effect.acquireRelease for lifecycle management:
 * - Acquire: start server, accept connections
 * - Release: close all connections, cleanup resources
 *
 * Configuration is implementation-specific and should be passed
 * when constructing the service implementation.
 */
export interface AcceptorInterface<TMessage extends TransportMessage = TransportMessage> {
  readonly start: () => Effect.Effect<Transport<TMessage>, ServerStartError, Scope.Scope>;
}

// ============================================================================
// Service Definitions using Effect.Tag
// ============================================================================

/**
 * Service tag for Server Transport Acceptor.
 * Accepts client connections and creates server transports.
 */
export interface Acceptor extends AcceptorInterface {}

export class Acceptor extends Effect.Tag('@transport/Server.Acceptor')<
  Acceptor,
  AcceptorInterface
>() {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a client ID from a string
 */
export const makeClientId = (id: string): ClientId => ClientId(id);
