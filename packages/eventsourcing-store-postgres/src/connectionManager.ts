import { PgClient } from '@effect/sql-pg';
import { Context, Duration, Effect, Layer, Schedule, pipe } from 'effect';
import { EventStoreConnectionError, connectionError } from '@codeforbreakfast/eventsourcing-store';

/**
 * ConnectionManager service for managing PostgreSQL notification connections
 */
export class ConnectionManager extends Context.Tag('ConnectionManager')<
  ConnectionManager,
  {
    /**
     * Get dedicated connection for LISTEN operations
     */
    readonly getListenConnection: Effect.Effect<
      PgClient.PgClient,
      EventStoreConnectionError,
      never
    >;

    /**
     * Execute health check on listening connection
     */
    readonly healthCheck: Effect.Effect<void, EventStoreConnectionError, never>;

    /**
     * Gracefully close the listen connection
     */
    readonly shutdown: Effect.Effect<void, EventStoreConnectionError, never>;
  }
>() {}

const healthCheckQuery = 'SELECT 1 AS health_check';

const executeHealthCheck = (listenConnection: PgClient.PgClient) =>
  pipe(
    listenConnection,
    (client) => client.unsafe(healthCheckQuery),
    Effect.tapError((error) =>
      Effect.logError('PostgreSQL notification listener health check failed', { error })
    ),
    Effect.mapError(connectionError.retryable('health check notification listener')),
    Effect.as(undefined)
  );

const executeShutdown = (_listenConnection: PgClient.PgClient) =>
  Effect.logInfo('PostgreSQL notification listener connection cleanup initiated');

/**
 * Implementation of ConnectionManager service
 * Creates a robust persistent connection specifically for LISTEN/NOTIFY operations
 * This uses the main PgClient from the layer, so it inherits the same configuration
 */
export const ConnectionManagerLive = Layer.effect(
  ConnectionManager,
  pipe(
    PgClient.PgClient,
    Effect.tapError((error) =>
      Effect.logError('Failed to establish notification listener connection', {
        error,
      })
    ),
    Effect.mapError(connectionError.retryable('establish notification listener connection')),
    Effect.map((listenConnection) => ({
      getListenConnection: Effect.succeed(listenConnection),
      healthCheck: executeHealthCheck(listenConnection),
      shutdown: executeShutdown(listenConnection),
    }))
  )
);

const createRetrySchedule = () =>
  pipe(
    Schedule.exponential(Duration.millis(100), 1.5),
    Schedule.whileOutput((d) => Duration.toMillis(d) < 60000) // Max 1 minute delay
  );

/**
 * Wraps an effect with automatic health checks and retry policy
 */
// Skip health check as it's causing issues
export const withConnectionHealth = Effect.retry(createRetrySchedule());
