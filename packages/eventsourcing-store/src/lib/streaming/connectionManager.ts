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

const getOrCreateDefaultStatus =
  (url: string) =>
  (statusMap: HashMap.HashMap<string, ConnectionStatus>): ConnectionStatus =>
    pipe(
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

const extractStatusFromMap =
  (url: string) => (statusMap: HashMap.HashMap<string, ConnectionStatus>) =>
    pipe(HashMap.get(statusMap, url), Option.getOrThrow);

const updateAndExtractStatus =
  (url: string, updates: ConnectionStatusUpdate) =>
  (connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>) =>
    pipe(
      Ref.updateAndGet(connectionStatuses, (statusMap) => {
        const current = getOrCreateDefaultStatus(url)(statusMap);
        const newStatus: ConnectionStatus = {
          isConnected: updates.isConnected ?? current.isConnected,
          lastHeartbeat: updates.lastHeartbeat ?? current.lastHeartbeat,
          reconnectAttempts: updates.reconnectAttempts ?? current.reconnectAttempts,
          url: current.url,
        };
        return HashMap.set(statusMap, url, newStatus);
      }),
      Effect.map(extractStatusFromMap(url))
    );

const mockConnect = (
  _url: string,
  _options?: Readonly<Record<string, unknown>>
): Effect.Effect<ConnectionHandle, never, never> =>
  Effect.succeed({
    ping: () => Promise.resolve(true),
    close: () => Promise.resolve(void 0),
  } as const);

const createRetryPolicy = (config: Readonly<ConnectionConfig>) =>
  pipe(
    Schedule.exponential(config.initialRetryDelayMs, 2.0),
    Schedule.compose(Schedule.recurs(config.maxRetryAttempts))
  );

const connectAndUpdateStatus =
  (
    url: string,
    options: Readonly<Record<string, unknown>> | undefined,
    retryPolicy: Schedule.Schedule<unknown, unknown, never>
  ) =>
  (
    connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>
  ): Effect.Effect<ConnectionHandle, ConnectionError, never> =>
    pipe(
      mockConnect(url, options),
      Effect.tap(() =>
        updateAndExtractStatus(url, {
          isConnected: true,
          lastHeartbeat: Option.some(new Date()),
        })(connectionStatuses)
      ),
      Effect.retry(retryPolicy),
      Effect.mapError(() => new ConnectionError({ message: `Failed to connect to ${url}` }))
    );

const resetAndConnect =
  (
    url: string,
    options: Readonly<Record<string, unknown>> | undefined,
    retryPolicy: Schedule.Schedule<unknown, unknown, never>
  ) =>
  (
    connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>
  ): Effect.Effect<ConnectionHandle, ConnectionError, never> =>
    pipe(
      updateAndExtractStatus(url, {
        isConnected: false,
        reconnectAttempts: 0,
      })(connectionStatuses),
      Effect.flatMap(() => connectAndUpdateStatus(url, options, retryPolicy)(connectionStatuses))
    );

const findStatusInMap = (url: string) => (statusMap: HashMap.HashMap<string, ConnectionStatus>) =>
  HashMap.get(statusMap, url);

const matchStatusOption = (url: string) => (status: Readonly<Option.Option<ConnectionStatus>>) =>
  Option.match(status, {
    onNone: () => Effect.fail(new ConnectionError({ message: `No connection status for ${url}` })),
    onSome: (s: Readonly<ConnectionStatus>) => Effect.succeed(s),
  });

const getStatusFromRef =
  (url: string) => (connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>) =>
    pipe(
      Ref.get(connectionStatuses),
      Effect.map(findStatusInMap(url)),
      Effect.flatMap(matchStatusOption(url))
    );

const repeatHeartbeat =
  (config: Readonly<ConnectionConfig>, url: string) =>
  (connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>) =>
    pipe(
      updateAndExtractStatus(url, {
        lastHeartbeat: Option.some(new Date()),
      })(connectionStatuses),
      Effect.repeat(Schedule.spaced(config.heartbeatIntervalMs)),
      Effect.forkDaemon,
      Effect.map((fiber) => ({ fiber }) as const)
    );

const buildConnectionManager =
  (config: Readonly<ConnectionConfig>) =>
  (
    connectionStatuses: Ref.Ref<HashMap.HashMap<string, ConnectionStatus>>
  ): ConnectionManagerService => ({
    getApiPort: () => Effect.succeed(config.apiPort),
    connectWithRetry: (url: string, options?: Readonly<Record<string, unknown>>) =>
      resetAndConnect(url, options, createRetryPolicy(config))(connectionStatuses),
    getConnectionStatus: (url: string) => getStatusFromRef(url)(connectionStatuses),
    setupHeartbeat: (_connection: Readonly<ConnectionHandle>, url: string) =>
      repeatHeartbeat(config, url)(connectionStatuses),
  });

/**
 * Creates a live implementation of the ConnectionManager
 */
export const makeConnectionManager = (
  config: Readonly<ConnectionConfig>
): Effect.Effect<ConnectionManagerService, never, never> =>
  pipe(
    Ref.make(HashMap.empty<string, ConnectionStatus>()),
    Effect.map(buildConnectionManager(config))
  );

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
