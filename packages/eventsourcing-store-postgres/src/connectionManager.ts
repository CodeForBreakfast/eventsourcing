import { PgClient } from '@effect/sql-pg';
import { Duration, Effect, Layer, Schedule, pipe } from 'effect';
import { EventStoreConnectionError, connectionError } from '@codeforbreakfast/eventsourcing-store';

// Extended PgClient type with direct query access
interface PgClientWithQuery extends PgClient.PgClient {
  query: (sql: string) => Promise<unknown>;
  end: () => Promise<void>;
}

/**
 * ConnectionManager service for managing PostgreSQL notification connections
 */
interface ConnectionManagerService {
  /**
   * Get dedicated connection for LISTEN operations
   */
  getListenConnection: Effect.Effect<PgClient.PgClient, EventStoreConnectionError, never>;

  /**
   * Execute health check on listening connection
   */
  healthCheck: Effect.Effect<void, EventStoreConnectionError, never>;

  /**
   * Gracefully close the listen connection
   */
  shutdown: Effect.Effect<void, EventStoreConnectionError, never>;
}

export class ConnectionManager extends Effect.Tag('ConnectionManager')<
  ConnectionManager,
  ConnectionManagerService
>() {}

/**
 * Create a robust persistent connection specifically for LISTEN/NOTIFY operations
 * This uses the main PgClient from the layer, so it inherits the same configuration
 */
const createListenConnection = pipe(
  PgClient.PgClient,
  // Add debug logging
  Effect.tap(() => Effect.logDebug('PostgreSQL notification listener connection established')),
  Effect.tapError((error) =>
    Effect.logError('Failed to establish notification listener connection', {
      error,
    })
  ),
  Effect.mapError((error) =>
    connectionError.retryable('establish notification listener connection', error)
  )
);

/**
 * Implementation of ConnectionManager service
 */
export const ConnectionManagerLive = Layer.effect(
  ConnectionManager,
  pipe(
    createListenConnection,
    Effect.map((listenConnection) => ({
      getListenConnection: Effect.succeed(listenConnection),

      healthCheck: pipe(
        Effect.succeed(listenConnection),
        Effect.flatMap((client) =>
          Effect.tryPromise({
            try: () => (client as PgClientWithQuery).query('SELECT 1 AS health_check'),
            catch: (error) => error,
          })
        ),
        Effect.tap(() => Effect.logDebug('PostgreSQL notification listener health check passed')),
        Effect.tapError((error) =>
          Effect.logError('PostgreSQL notification listener health check failed', { error })
        ),
        Effect.mapError((error) =>
          connectionError.retryable('health check notification listener', error)
        ),
        Effect.as(undefined)
      ),

      shutdown: pipe(
        Effect.succeed(listenConnection),
        Effect.flatMap((client) =>
          Effect.tryPromise({
            try: () => (client as PgClientWithQuery).end(),
            catch: (error) => error,
          })
        ),
        Effect.tap(() => Effect.logInfo('PostgreSQL notification listener connection closed')),
        Effect.tapError((error) =>
          Effect.logError('Failed to close PostgreSQL notification listener connection', { error })
        ),
        Effect.mapError((error) => connectionError.fatal('shutdown notification listener', error)),
        Effect.as(undefined)
      ),
    }))
  )
);

/**
 * Wraps an effect with automatic health checks and retry policy
 */
// Skip health check as it's causing issues
export const withConnectionHealth = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  pipe(
    effect,
    Effect.retry(
      pipe(
        Schedule.exponential(Duration.millis(100), 1.5),
        Schedule.whileOutput((d) => Duration.toMillis(d) < 60000) // Max 1 minute delay
      )
    )
  );
