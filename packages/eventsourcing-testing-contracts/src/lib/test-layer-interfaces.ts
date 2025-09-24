/**
 * Transport Test Interfaces
 *
 * Contract testing interfaces for transport layer implementations.
 * Tests ONLY message delivery mechanics and connection management.
 */

import { Effect, Stream, Scope, Schema } from 'effect';
import type {
  ConnectionState as CoreConnectionState,
  TransportError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// TRANSPORT CONTRACT TEST INTERFACES
// =============================================================================

/**
 * Transport message schema for compile-time and runtime validation
 */
export const TransportMessageSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  type: Schema.NonEmptyString,
  payload: Schema.Unknown,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

export interface TransportMessage extends Schema.Schema.Type<typeof TransportMessageSchema> {}

/**
 * Connection state from transport contracts
 */
export type ConnectionState = CoreConnectionState;

/**
 * Transport test context for testing the simplified ConnectedTransport interface.
 *
 * IMPORTANT: This interface models the Effect.acquireRelease pattern.
 * The `createConnectedTransport` method should use Scope to manage lifecycle.
 * When the Scope closes, the transport should automatically disconnect.
 */
export interface TransportTestContext {
  // Transport factory using Effect's Scope for lifecycle management
  readonly makeConnectedTransport: (
    url: string
  ) => Effect.Effect<ConnectedTransportTestInterface, TransportError, Scope.Scope>;

  // Optional test utilities for advanced testing scenarios
  readonly simulateDisconnect?: () => Effect.Effect<void, never, never>;
  readonly simulateReconnect?: () => Effect.Effect<void, never, never>;
}

/**
 * Test interface that mirrors the simplified ConnectedTransport interface
 */
export interface ConnectedTransportTestInterface {
  // Connection state monitoring
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;

  // Message operations with proper error typing
  readonly publish: (message: TransportMessage) => Effect.Effect<void, TransportError, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never>;
}

/**
 * Test runner type for transport contract tests
 */
export type TransportTestRunner = (
  name: string,
  setup: () => Effect.Effect<TransportTestContext>
) => void;
