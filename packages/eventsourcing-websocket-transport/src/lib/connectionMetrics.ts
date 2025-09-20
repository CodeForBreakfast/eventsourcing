import { Effect, Ref, Duration, Option, pipe, Schema } from 'effect';

// Metrics data structures with strong typing
export const ConnectionMetrics = Schema.Struct({
  messagesReceived: Schema.Number,
  messagesSent: Schema.Number,
  bytesReceived: Schema.Number,
  bytesSent: Schema.Number,
  connectionAttempts: Schema.Number,
  successfulConnections: Schema.Number,
  failedConnections: Schema.Number,
  lastMessageReceivedAt: Schema.optional(Schema.Date),
  lastMessageSentAt: Schema.optional(Schema.Date),
  averageMessageSize: Schema.Number,
  peakMessageSize: Schema.Number,
});

export type ConnectionMetrics = Schema.Schema.Type<typeof ConnectionMetrics>;

// Health status based on metrics
export type ConnectionHealth =
  | { readonly _tag: 'healthy' }
  | { readonly _tag: 'degraded'; readonly reason: string }
  | { readonly _tag: 'unhealthy'; readonly reasons: readonly string[] };

// Connection quality indicators
export interface ConnectionQuality {
  readonly latency: Option.Option<Duration.Duration>;
  readonly throughput: number; // messages per second
  readonly errorRate: number; // percentage
  readonly health: ConnectionHealth;
}

// Metrics tracker interface
export interface MetricsTracker {
  readonly recordMessageSent: (bytes: number) => Effect.Effect<void>;
  readonly recordMessageReceived: (bytes: number) => Effect.Effect<void>;
  readonly recordConnectionAttempt: () => Effect.Effect<void>;
  readonly recordConnectionSuccess: () => Effect.Effect<void>;
  readonly recordConnectionFailure: () => Effect.Effect<void>;
  readonly getMetrics: () => Effect.Effect<ConnectionMetrics>;
  readonly getConnectionQuality: () => Effect.Effect<ConnectionQuality>;
  readonly reset: () => Effect.Effect<void>;
}

const initialMetrics: ConnectionMetrics = {
  messagesReceived: 0,
  messagesSent: 0,
  bytesReceived: 0,
  bytesSent: 0,
  connectionAttempts: 0,
  successfulConnections: 0,
  failedConnections: 0,
  averageMessageSize: 0,
  peakMessageSize: 0,
};

// Helper to create an empty metrics tracker for initialization
export const createEmptyMetricsTracker = (): MetricsTracker => ({
  recordMessageSent: () => Effect.void,
  recordMessageReceived: () => Effect.void,
  recordConnectionAttempt: () => Effect.void,
  recordConnectionSuccess: () => Effect.void,
  recordConnectionFailure: () => Effect.void,
  getMetrics: () => Effect.succeed(initialMetrics),
  getConnectionQuality: () =>
    Effect.succeed({
      latency: Option.none(),
      throughput: 0,
      errorRate: 0,
      health: { _tag: 'healthy' },
    }),
  reset: () => Effect.void,
});

export const createMetricsTracker = (): Effect.Effect<MetricsTracker> =>
  pipe(
    Ref.make(initialMetrics),
    Effect.map((metricsRef) => ({
      recordMessageSent: (bytes: number) =>
        Ref.update(metricsRef, (metrics) => {
          const newTotal = metrics.messagesSent + 1;
          const totalBytes = metrics.bytesSent + bytes;
          const newAverage = totalBytes / newTotal;
          return {
            ...metrics,
            messagesSent: newTotal,
            bytesSent: totalBytes,
            lastMessageSentAt: new Date(),
            averageMessageSize: newAverage,
            peakMessageSize: Math.max(metrics.peakMessageSize, bytes),
          };
        }),

      recordMessageReceived: (bytes: number) =>
        Ref.update(metricsRef, (metrics) => {
          const newTotal = metrics.messagesReceived + 1;
          const totalBytes = metrics.bytesReceived + bytes;
          const newAverage = totalBytes / newTotal;
          return {
            ...metrics,
            messagesReceived: newTotal,
            bytesReceived: totalBytes,
            lastMessageReceivedAt: new Date(),
            averageMessageSize: newAverage,
            peakMessageSize: Math.max(metrics.peakMessageSize, bytes),
          };
        }),

      recordConnectionAttempt: () =>
        Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          connectionAttempts: metrics.connectionAttempts + 1,
        })),

      recordConnectionSuccess: () =>
        Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          successfulConnections: metrics.successfulConnections + 1,
        })),

      recordConnectionFailure: () =>
        Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          failedConnections: metrics.failedConnections + 1,
        })),

      getMetrics: () => Ref.get(metricsRef),

      getConnectionQuality: () =>
        pipe(
          Ref.get(metricsRef),
          Effect.map((metrics): ConnectionQuality => {
            const totalAttempts = metrics.connectionAttempts;
            const errorRate =
              totalAttempts > 0
                ? (metrics.failedConnections / totalAttempts) * 100
                : 0;

            const now = Date.now();
            const lastActivity = Math.max(
              metrics.lastMessageReceivedAt?.getTime() || 0,
              metrics.lastMessageSentAt?.getTime() || 0,
            );

            const timeSinceLastActivity =
              lastActivity > 0 ? now - lastActivity : Infinity;
            const throughput =
              metrics.messagesSent > 0 && lastActivity > 0
                ? metrics.messagesSent / ((now - lastActivity) / 1000)
                : 0;

            const healthReasons = [
              ...(errorRate > 50 ? ['High error rate'] : []),
              ...(timeSinceLastActivity > 60000 ? ['No recent activity'] : []),
              ...(throughput < 0.1 && metrics.messagesSent > 10
                ? ['Low throughput']
                : []),
            ];

            const health: ConnectionHealth =
              healthReasons.length === 0
                ? { _tag: 'healthy' }
                : healthReasons.length === 1
                  ? { _tag: 'degraded', reason: healthReasons[0]! }
                  : { _tag: 'unhealthy', reasons: healthReasons };

            return {
              latency: Option.none(), // Would need ping/pong to measure
              throughput,
              errorRate,
              health,
            };
          }),
        ),

      reset: () => Ref.set(metricsRef, initialMetrics),
    })),
  );

// Helper to format metrics for logging
export const formatMetrics = (metrics: ConnectionMetrics): string => {
  const parts = [
    `Messages: ${metrics.messagesSent}↑ ${metrics.messagesReceived}↓`,
    `Bytes: ${metrics.bytesSent}↑ ${metrics.bytesReceived}↓`,
    `Connections: ${metrics.successfulConnections}✓ ${metrics.failedConnections}✗`,
    `Avg size: ${Math.round(metrics.averageMessageSize)}B`,
  ];
  return parts.join(' | ');
};
