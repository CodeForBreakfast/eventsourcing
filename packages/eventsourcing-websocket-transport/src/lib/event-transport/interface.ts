/**
 * @module WebSocketEventTransport
 *
 * A domain-agnostic WebSocket transport layer for event streams.
 *
 * This module provides a clean abstraction for streaming events over WebSocket
 * connections, designed to work seamlessly with the existing eventstore infrastructure.
 * It supports subscribing to multiple event streams, sending commands to aggregates,
 * and handles connection lifecycle management.
 *
 * @example
 * ```typescript
 * import { WebSocketEventTransport } from '@codeforbreakfast/eventsourcing-websocket-transport';
 *
 * const program = pipe(
 *   WebSocketEventTransport,
 *   Effect.flatMap(transport =>
 *     pipe(
 *       transport.connect(url),
 *       Effect.flatMap(() => transport.subscribeToStream(streamId)),
 *       Stream.tap(event => Console.log('Received event:', event)),
 *       Stream.runDrain
 *     )
 *   )
 * );
 * ```
 */

import { Effect } from 'effect';
import type { WebSocketEventTransport, TransportConfig } from './types';

/**
 * WebSocketEventTransport Service Interface
 *
 * Provides methods to create and manage WebSocket event transport instances.
 * This service can be used with Effect's dependency injection system.
 */
export interface WebSocketEventTransportServiceInterface<TEvent = unknown> {
  /**
   * Create a new WebSocket event transport instance
   * @returns A new transport instance
   */
  readonly create: () => Effect.Effect<WebSocketEventTransport<TEvent>>;

  /**
   * Create a transport instance with custom configuration
   * @param config - Transport configuration options
   * @returns A configured transport instance
   */
  readonly createWithConfig: (
    config: Readonly<TransportConfig>
  ) => Effect.Effect<WebSocketEventTransport<TEvent>>;
}

/**
 * Default transport configuration
 */
export const defaultTransportConfig: Required<TransportConfig> = {
  maxReconnectAttempts: 5,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  reconnectBackoffMultiplier: 1.5,
  connectionTimeoutMs: 30000,
  heartbeatIntervalMs: 30000,
  eventBufferSize: 100,
  autoReconnect: true,
  debug: false,
};

/**
 * WebSocketEventTransport Service Tag
 *
 * Use this tag to access the transport service in your Effect programs.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   WebSocketEventTransportService,
 *   Effect.flatMap(service => service.create()),
 *   Effect.flatMap(transport => transport.connect(url))
 * );
 * ```
 */
export class WebSocketEventTransportService extends Effect.Tag('WebSocketEventTransportService')<
  WebSocketEventTransportService,
  WebSocketEventTransportServiceInterface<unknown>
>() {}
