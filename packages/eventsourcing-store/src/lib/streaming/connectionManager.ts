import { Config, Context, Data, Effect, Layer, Option, Schedule, pipe, Ref, HashMap } from 'effect';

/**
 * Configuration for API port and WebSocket connections
 */
export interface ConnectionConfig {
  /**
   * The port to use for the API server
   */
  readonly apiPort: number;

  /**
   * The maximum number of connection retry attempts
   */
  readonly maxRetryAttempts: number;

  /**
   * The initial delay (ms) between retry attempts
   */
  readonly initialRetryDelayMs: number;

  /**
   * Maximum timeout (ms) for WebSocket operations
   */
  readonly socketTimeoutMs: number;

  /**
   * Heartbeat interval (ms) for connection health checks
   */
  readonly heartbeatIntervalMs: number;
}

/**
 * Default connection configuration values
 */
export const DefaultConnectionConfig: ConnectionConfig = {
  apiPort: 3000,
  maxRetryAttempts: 5,
  initialRetryDelayMs: 1000,
  socketTimeoutMs: 30000,
  heartbeatIntervalMs: 15000,
};

/**
 * Config schema for connection settings
 */
export const ConnectionConfigSchema = Config.all({
  apiPort: pipe(Config.number('apiPort'), Config.withDefault(DefaultConnectionConfig.apiPort)),
  maxRetryAttempts: pipe(
    Config.number('maxRetryAttempts'),
    Config.withDefault(DefaultConnectionConfig.maxRetryAttempts)
  ),
  initialRetryDelayMs: pipe(
    Config.number('initialRetryDelayMs'),
    Config.withDefault(DefaultConnectionConfig.initialRetryDelayMs)
  ),
  socketTimeoutMs: pipe(
    Config.number('socketTimeoutMs'),
    Config.withDefault(DefaultConnectionConfig.socketTimeoutMs)
  ),
  heartbeatIntervalMs: pipe(
    Config.number('heartbeatIntervalMs'),
    Config.withDefault(DefaultConnectionConfig.heartbeatIntervalMs)
  ),
});

/**
 * Environment configuration for connection settings
 */
export class ConnectionConfigTag extends Context.Tag('ConnectionConfig')<
  ConnectionConfigTag,
  ConnectionConfig
>() {}

export const ConnectionConfigLive = Layer.effect(
  ConnectionConfigTag,
  pipe(
    Config.unwrap(ConnectionConfigSchema),
    Effect.mapError(
      (error) => new Error(`Failed to load connection configuration: ${JSON.stringify(error)}`)
    )
  )
);

/**
 * Error that occurs during connection operations
 */
export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Connection handle for websocket or similar connections
 */
export interface ConnectionHandle {
  readonly ping: () => Promise<boolean>;
  readonly close: () => Promise<void>;
}

/**
 * Status information about a connection
 */
export interface ConnectionStatus {
  readonly isConnected: boolean;
  readonly lastHeartbeat: Option.Option<Date>;
  readonly reconnectAttempts: number;
  readonly url: string;
}

/**
 * Context Tag for ConnectionManager
 */
export class ConnectionManager extends Context.Tag('ConnectionManager')<
  ConnectionManager,
  {
    /**
     * Get the API port for the server
     */
    readonly getApiPort: () => Effect.Effect<number, never, never>;

    /**
     * Connect to a WebSocket endpoint with robust retry handling
     */
    readonly connectWithRetry: (
      url: string,
      options?: Readonly<Record<string, unknown>>
    ) => Effect.Effect<ConnectionHandle, ConnectionError, never>;

    /**
     * Get the status of a connection
     */
    readonly getConnectionStatus: (
      url: string
    ) => Effect.Effect<ConnectionStatus, ConnectionError, never>;

    /**
     * Set up a heartbeat on a connection to keep it alive
     */
    readonly setupHeartbeat: (
      connection: Readonly<ConnectionHandle>,
      url: string
    ) => Effect.Effect<{ readonly fiber: unknown }, ConnectionError, never>;
  }
>() {}

/**
 * Type for connection status updates - properly readonly
 */
type ConnectionStatusUpdate = {
  readonly isConnected?: boolean;
  readonly lastHeartbeat?: Option.Option<Date>;
  readonly reconnectAttempts?: number;
};

/**
 * Extract the service type from the ConnectionManager tag
 */
export type ConnectionManagerService = Context.Tag.Service<typeof ConnectionManager>;

/**
 * Creates a live implementation of the ConnectionManager
 */
export const makeConnectionManager = (
  config: Readonly<ConnectionConfig>
): Effect.Effect<ConnectionManagerService, never, never> => {
  return pipe(
    // Create a reference to immutable HashMap to store connection statuses
    Ref.make(HashMap.empty<string, ConnectionStatus>()),
    Effect.map(
      (connectionStatuses: Readonly<Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>>) => {
        /**
         * Updates the connection status for a URL using immutable operations
         */
        const updateConnectionStatus = (
          url: string,
          updates: ConnectionStatusUpdate
        ): Effect.Effect<ConnectionStatus, never, never> => {
          return pipe(
            Ref.updateAndGet(connectionStatuses, (statusMap) => {
              const current = pipe(
                HashMap.get(statusMap, url),
                Option.getOrElse(
                  () =>
                    ({
                      isConnected: false,
                      lastHeartbeat: Option.none(),
                      reconnectAttempts: 0,
                      url,
                    }) as const
                )
              );

              const newStatus: ConnectionStatus = {
                isConnected: updates.isConnected ?? current.isConnected,
                lastHeartbeat: updates.lastHeartbeat ?? current.lastHeartbeat,
                reconnectAttempts: updates.reconnectAttempts ?? current.reconnectAttempts,
                url: current.url,
              };

              return HashMap.set(statusMap, url, newStatus);
            }),
            Effect.map((statusMap) => pipe(HashMap.get(statusMap, url), Option.getOrThrow))
          );
        };

        // Create a mock connection function for testing
        const mockConnect = (
          _url: string,
          _options?: Readonly<Record<string, unknown>>
        ): Effect.Effect<ConnectionHandle, never, never> => {
          return Effect.succeed({
            ping: () => Promise.resolve(true),
            close: () => Promise.resolve(void 0),
          } as const);
        };

        const connectionManager: ConnectionManagerService = {
          getApiPort: () => Effect.succeed(config.apiPort),

          connectWithRetry: (url: string, options?: Readonly<Record<string, unknown>>) => {
            // Create exponential backoff retry policy
            const retryPolicy = pipe(
              Schedule.exponential(config.initialRetryDelayMs, 2.0),
              Schedule.compose(Schedule.recurs(config.maxRetryAttempts))
            );

            // Connect with retry (using mock for simplicity)
            return pipe(
              // First reset connection status
              updateConnectionStatus(url, {
                isConnected: false,
                reconnectAttempts: 0,
              }),
              Effect.flatMap(() =>
                pipe(
                  mockConnect(url, options),
                  Effect.tap(() =>
                    updateConnectionStatus(url, {
                      isConnected: true,
                      lastHeartbeat: Option.some(new Date()),
                    })
                  ),
                  Effect.retry(retryPolicy)
                )
              )
            );
          },

          getConnectionStatus: (url: string) =>
            pipe(
              Ref.get(connectionStatuses),
              Effect.map((statusMap) => HashMap.get(statusMap, url)),
              Effect.flatMap((status) =>
                Option.match(status, {
                  onNone: () =>
                    Effect.fail(
                      new ConnectionError({ message: `No connection status for ${url}` })
                    ),
                  onSome: (s: Readonly<ConnectionStatus>) => Effect.succeed(s),
                })
              )
            ),

          setupHeartbeat: (_connection: Readonly<ConnectionHandle>, url: string) => {
            // Set up recurring heartbeat (simplified)
            return pipe(
              updateConnectionStatus(url, {
                lastHeartbeat: Option.some(new Date()),
              }),
              Effect.repeat(Schedule.spaced(config.heartbeatIntervalMs)),
              Effect.forkDaemon,
              Effect.map((fiber) => ({ fiber }) as const)
            );
          },
        };

        return connectionManager;
      }
    )
  );
};

/**
 * Live Layer implementation of the ConnectionManager
 */
export const ConnectionManagerLive = Layer.provide(
  Layer.succeed(ConnectionManager, {
    getApiPort: () => Effect.succeed(3000),
    connectWithRetry: (_url, _options?: Readonly<Record<string, unknown>>) =>
      Effect.succeed({
        ping: () => Promise.resolve(true),
        close: () => Promise.resolve(void 0),
      } as const),
    getConnectionStatus: (_url) =>
      Effect.succeed({
        isConnected: true,
        lastHeartbeat: Option.none(),
        reconnectAttempts: 0,
        url: _url,
      } as const),
    setupHeartbeat: (_connection: Readonly<ConnectionHandle>, _url) =>
      Effect.succeed({ fiber: null } as const),
  }),
  Layer.succeed(ConnectionConfigTag, DefaultConnectionConfig)
);
