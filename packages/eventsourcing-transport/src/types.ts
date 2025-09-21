import { Effect, Stream, Duration, Scope } from 'effect';
import {
  TransportConnectionError,
  TransportPublishError,
  TransportSubscriptionError,
} from './errors.js';

export interface TransportHealth {
  readonly connected: boolean;
  readonly lastHeartbeat?: Date;
  readonly errorCount: number;
  readonly uptime: number;
}

export interface TransportMetrics {
  readonly messagesPublished: number;
  readonly messagesReceived: number;
  readonly activeSubscriptions: number;
  readonly connectionAttempts: number;
  readonly errors: number;
}

export interface SubscriptionOptions {
  readonly bufferSize?: number;
  readonly fromPosition?: number | 'beginning' | 'end';
  readonly includeMetadata?: boolean;
}

export interface StreamMessage<TData = unknown, TStreamId = string> {
  readonly streamId: TStreamId;
  readonly data: TData;
  readonly position?: number;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface TransportConfig {
  readonly url: string;
  readonly retryAttempts: number;
  readonly timeout: Duration.Duration;
}

/**
 * Connected transport interface - only available after successful connection.
 * This interface represents a transport that is guaranteed to be connected
 * and ready for use. Methods on this interface can be called safely.
 */
export interface ConnectedTransport<TData = unknown, TStreamId = string, R = never> {
  readonly publish: (
    streamId: TStreamId,
    data: TData,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError, R>;

  readonly subscribe: (
    streamId: TStreamId,
    options?: SubscriptionOptions
  ) => Stream.Stream<StreamMessage<TData, TStreamId>, TransportSubscriptionError, R>;

  readonly subscribeMultiple: (
    streamIds: readonly TStreamId[],
    options?: SubscriptionOptions
  ) => Stream.Stream<StreamMessage<TData, TStreamId>, TransportSubscriptionError, R>;

  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;

  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
}

/**
 * Creates a connected transport within a scope.
 * The connection is established during acquire and cleaned up during release.
 * This makes it impossible to use transport methods without being connected.
 *
 * @example
 * ```typescript
 * // Create a transport factory with config baked in
 * const createMyTransport = (config: TransportConfig) =>
 *   Effect.acquireRelease(
 *     // Acquire: establish connection
 *     establishConnection(config),
 *     // Release: cleanup
 *     (connection) => closeConnection(connection)
 *   );
 *
 * // Use it in a scoped context
 * const program = Effect.scoped(
 *   pipe(
 *     createMyTransport(config),
 *     Effect.flatMap((transport) =>
 *       transport.publish("stream-1", { hello: "world" })
 *     )
 *   )
 * );
 * ```
 */
export type CreateTransport<TData = unknown, TStreamId = string, R = never> = (
  config: TransportConfig
) => Effect.Effect<
  ConnectedTransport<TData, TStreamId, R>,
  TransportConnectionError,
  R | Scope.Scope
>;
