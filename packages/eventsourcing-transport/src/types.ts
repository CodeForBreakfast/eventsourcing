import { Effect, Stream, Duration } from 'effect';
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

export interface Transport<TData = unknown, TStreamId = string, R = never> {
  readonly connect: () => Effect.Effect<void, TransportConnectionError, R>;

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

  readonly close: () => Effect.Effect<void, TransportConnectionError, R>;
}
