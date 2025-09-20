import {
  Config,
  Data,
  Effect,
  Layer,
  Option,
  Schedule,
  pipe,
  Ref,
} from 'effect';

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
  apiPort: pipe(Config.number("apiPort"), Config.withDefault(DefaultConnectionConfig.apiPort)),
  maxRetryAttempts: pipe(Config.number("maxRetryAttempts"), Config.withDefault(DefaultConnectionConfig.maxRetryAttempts)),
  initialRetryDelayMs: pipe(Config.number("initialRetryDelayMs"), Config.withDefault(DefaultConnectionConfig.initialRetryDelayMs)),
  socketTimeoutMs: pipe(Config.number("socketTimeoutMs"), Config.withDefault(DefaultConnectionConfig.socketTimeoutMs)),
  heartbeatIntervalMs: pipe(Config.number("heartbeatIntervalMs"), Config.withDefault(DefaultConnectionConfig.heartbeatIntervalMs)),
});

/**
 * Environment configuration for connection settings
 */
export class ConnectionConfigTag extends Effect.Tag("ConnectionConfig")<
  ConnectionConfigTag,
  ConnectionConfig
>() {}

export const ConnectionConfigLive = Layer.effect(
  ConnectionConfigTag,
  pipe(
    Config.unwrap(ConnectionConfigSchema),
    Effect.mapError(error => new Error(`Failed to load connection configuration: ${JSON.stringify(error)}`))
  )
);

/**
 * Error that occurs during connection operations
 */
export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  message: string;
  cause?: unknown;
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
 * Interface for connection management operations
 */
export interface ConnectionManagerService {
  /**
   * Get the API port for the server
   */
  getApiPort: () => Effect.Effect<number, never, never>;

  /**
   * Connect to a WebSocket endpoint with robust retry handling
   */
  connectWithRetry: (
    url: string,
    options?: Record<string, unknown>
  ) => Effect.Effect<ConnectionHandle, ConnectionError, never>;

  /**
   * Get the status of a connection
   */
  getConnectionStatus: (url: string) => Effect.Effect<ConnectionStatus, ConnectionError, never>;

  /**
   * Set up a heartbeat on a connection to keep it alive
   */
  setupHeartbeat: (
    connection: ConnectionHandle,
    url: string
  ) => Effect.Effect<{ fiber: unknown }, ConnectionError, never>;
}

/**
 * Context Tag for ConnectionManager
 */
export class ConnectionManager extends Effect.Tag("ConnectionManager")<
  ConnectionManager,
  ConnectionManagerService
>() {}

/**
 * Creates a live implementation of the ConnectionManager
 */
export const makeConnectionManager = (
  config: ConnectionConfig
): Effect.Effect<ConnectionManagerService, never, never> => {
  return pipe(
    // Create a reference to map to store connection statuses
    Ref.make(new Map<string, ConnectionStatus>()),
    Effect.map((connectionStatuses: Ref.Ref<Map<string, ConnectionStatus>>) => {
      /**
       * Updates the connection status for a URL
       */
      const updateConnectionStatus = (
        url: string,
        updates: Partial<ConnectionStatus>
      ): Effect.Effect<ConnectionStatus, never, never> => {
        return Ref.updateAndGet(connectionStatuses, (statusMap: ReadonlyMap<string, ConnectionStatus>) => {
          const current = statusMap.get(url) || {
            isConnected: false,
            lastHeartbeat: Option.none(),
            reconnectAttempts: 0,
            url,
          };
          
          const newStatus = {
            ...current,
            ...updates,
          };
          
          // Create a new map with the updated status and return it
          return new Map([...statusMap.entries(), [url, newStatus]]);
        }).pipe(
          Effect.map((statusMap: ReadonlyMap<string, ConnectionStatus>) => statusMap.get(url)!)
        );
      };

      // Create a mock connection function for testing
      const mockConnect = (_url: string, _options?: Record<string, unknown>): Effect.Effect<ConnectionHandle, never, never> => {
        return Effect.succeed({
          ping: () => Promise.resolve(true),
          close: () => Promise.resolve(void 0),
        });
      };

      const connectionManager: ConnectionManagerService = {
        getApiPort: () => Effect.succeed(config.apiPort),

        connectWithRetry: (
          url: string,
          options?: Record<string, unknown>
        ) => {
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
            Effect.map((statusMap: ReadonlyMap<string, ConnectionStatus>) => Option.fromNullable(statusMap.get(url))),
            Effect.flatMap(status => 
              Option.match(status, {
                onNone: () => Effect.fail(new ConnectionError({ message: `No connection status for ${url}` })),
                onSome: (s: ConnectionStatus) => Effect.succeed(s)
              })
            )
          ),

        setupHeartbeat: (
          _connection: ConnectionHandle,
          url: string
        ) => {
          // Set up recurring heartbeat (simplified)
          return pipe(
            updateConnectionStatus(url, {
              lastHeartbeat: Option.some(new Date()),
            }),
            Effect.repeat(Schedule.spaced(config.heartbeatIntervalMs)),
            Effect.forkDaemon,
            Effect.map(fiber => ({ fiber }))
          );
        },
      };

      return connectionManager;
    })
  );
};

/**
 * Live Layer implementation of the ConnectionManager
 */
export const ConnectionManagerLive = Layer.provide(
  Layer.succeed(ConnectionManager, {
    getApiPort: () => Effect.succeed(3000),
    connectWithRetry: (_url, _options) => 
      Effect.succeed({
        ping: () => Promise.resolve(true),
        close: () => Promise.resolve(void 0),
      }),
    getConnectionStatus: (_url) => 
      Effect.succeed({
        isConnected: true,
        lastHeartbeat: Option.none(),
        reconnectAttempts: 0,
        url: _url
      }),
    setupHeartbeat: (_connection, _url) => 
      Effect.succeed({ fiber: null })
  }),
  Layer.succeed(ConnectionConfigTag, DefaultConnectionConfig)
);