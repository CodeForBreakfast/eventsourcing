/**
 * Server-Side Transport Abstractions
 *
 * Defines transport contracts for server-side operations including client connection
 * management, broadcasting, and server lifecycle using pure functional patterns.
 */

import { Context, Effect, Stream, Scope, Data, Brand } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
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
export interface ClientConnection {
  readonly clientId: ClientId;
  readonly transport: ClientTransport;
  readonly connectedAt: Date;
  readonly metadata: Record<string, unknown>;
}

/**
 * Server-side transport that manages multiple client connections.
 * Each client gets a Transport for bidirectional communication.
 * Transport layer only deals with string payloads - doesn't know about content structure.
 * Lifecycle is managed via Scope - when the scope closes, the server shuts down.
 */
export interface Transport {
  // Accept new client connections
  readonly connections: Stream.Stream<ClientConnection, never, never>;

  // Broadcasting to all connected clients
  readonly broadcast: (
    message: ReadonlyDeep<TransportMessage>
  ) => Effect.Effect<void, TransportError, never>;
}

/**
 * Service tag for Server Transport Acceptor.
 * Accepts client connections and creates server transports.
 *
 * Uses Effect.acquireRelease for lifecycle management:
 * - Acquire: start server, accept connections
 * - Release: close all connections, cleanup resources
 *
 * Configuration is implementation-specific and should be passed
 * when constructing the service implementation.
 */
export class Acceptor extends Context.Tag('@transport/Server.Acceptor')<
  Acceptor,
  {
    readonly start: () => Effect.Effect<Transport, ServerStartError, Scope.Scope>;
  }
>() {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a client ID from a string
 */
// eslint-disable-next-line effect/no-eta-expansion -- Public API wrapper providing explicit name for brand constructor
export const makeClientId = (id: string): ClientId => ClientId(id);
