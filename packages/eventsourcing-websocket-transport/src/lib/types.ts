import { Duration, Schema } from 'effect';

// WebSocket URL validation pattern: must start with ws:// or wss://
const webSocketUrlPattern = /^wss?:\/\/.+/;

// WebSocketUrl branded type with validation
export const WebSocketUrl = Schema.String.pipe(
  Schema.pattern(webSocketUrlPattern, {
    message: () =>
      'Invalid WebSocket URL format. Must start with ws:// or wss://',
  }),
  Schema.brand('WebSocketUrl'),
);

export type WebSocketUrl = Schema.Schema.Type<typeof WebSocketUrl>;

// Message size validation: 1 byte to 65KB (WebSocket frame size limit)
const MIN_MESSAGE_SIZE = 1;
const MAX_MESSAGE_SIZE = 65536; // 64KB

// OutgoingMessage branded type with size validation
export const OutgoingMessage = Schema.String.pipe(
  Schema.filter(
    (msg) => msg.length >= MIN_MESSAGE_SIZE && msg.length <= MAX_MESSAGE_SIZE,
    {
      message: () =>
        `Message size must be between ${MIN_MESSAGE_SIZE} and ${MAX_MESSAGE_SIZE} bytes`,
    },
  ),
  Schema.brand('OutgoingMessage'),
);

export type OutgoingMessage = Schema.Schema.Type<typeof OutgoingMessage>;

// WebSocket ready states as a schema
export const WebSocketReadyStateSchema = Schema.Literal(0, 1, 2, 3).pipe(
  Schema.annotations({
    title: 'WebSocketReadyState',
    description: 'WebSocket connection ready state',
  }),
);

export type WebSocketReadyState = Schema.Schema.Type<
  typeof WebSocketReadyStateSchema
>;

// Ready state mapping for better readability
export const WebSocketReadyStateMap = {
  0: 'CONNECTING',
  1: 'OPEN',
  2: 'CLOSING',
  3: 'CLOSED',
} as const;

// Helper to get readable state name
export const getReadyStateLabel = (state: WebSocketReadyState): string =>
  WebSocketReadyStateMap[state] ?? 'UNKNOWN';

// Message ID branded type
export const MessageId = Schema.String.pipe(
  Schema.pattern(/^msg-[0-9]+-[a-z0-9]+$/, {
    message: () => 'Invalid message ID format',
  }),
  Schema.brand('MessageId'),
);

export type MessageId = Schema.Schema.Type<typeof MessageId>;

// Disconnect reason as a discriminated union
export type DisconnectReason =
  | { readonly _tag: 'user_initiated' }
  | { readonly _tag: 'error'; readonly error: Error }
  | { readonly _tag: 'timeout'; readonly lastActivity: Date }
  | {
      readonly _tag: 'protocol_error';
      readonly code: number;
      readonly reason: string;
    };

// Connection lifecycle types with stronger typing
export interface ConnectionInfo {
  readonly url: WebSocketUrl;
  readonly connectedAt: Date;
  readonly readyState: WebSocketReadyState;
  readonly protocol: string;
  readonly extensions: string;
}

export interface SendResult {
  readonly messageId: MessageId;
  readonly sentAt: Date;
  readonly message: OutgoingMessage;
  readonly bytesSize: number;
  readonly queuedPosition?: number;
}

export interface DisconnectResult {
  readonly url: WebSocketUrl;
  readonly connectionDuration: Duration.Duration;
  readonly messagesProcessed: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly reason: DisconnectReason;
}

// Connection status as a proper discriminated union
export type ConnectionStatus =
  | { readonly _tag: 'disconnected' }
  | {
      readonly _tag: 'connecting';
      readonly url: WebSocketUrl;
      readonly attemptNumber: number;
    }
  | { readonly _tag: 'connected'; readonly info: ConnectionInfo }
  | { readonly _tag: 'disconnecting'; readonly reason: DisconnectReason }
  | {
      readonly _tag: 'error';
      readonly error: Error;
      readonly canRetry: boolean;
    };

// WebSocket close codes schema
export const WebSocketCloseCodeSchema = Schema.Number.pipe(
  Schema.filter((n) => n >= 1000 && n <= 4999, {
    message: () => 'Close code must be between 1000-4999',
  }),
);

export type WebSocketCloseCode = Schema.Schema.Type<
  typeof WebSocketCloseCodeSchema
>;

// Standard WebSocket close codes
export const StandardCloseCodes = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  INVALID_FRAME_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
} as const;

export type StandardCloseCode =
  (typeof StandardCloseCodes)[keyof typeof StandardCloseCodes];

// WebSocket message schemas for runtime validation
export const WebSocketMessageSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('ping'),
    timestamp: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal('pong'),
    timestamp: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal('data'),
    payload: Schema.Unknown,
    id: Schema.String,
  }),
);

export type WebSocketMessage = Schema.Schema.Type<
  typeof WebSocketMessageSchema
>;

// Typed WebSocket event map for better event handling
export interface TypedWebSocketEventMap {
  open: Event;
  message: MessageEvent<string>;
  error: Event;
  close: CloseEvent;
}

export type TypedWebSocketEventHandler<K extends keyof TypedWebSocketEventMap> =
  (event: Readonly<TypedWebSocketEventMap[K]>) => void;

// Duration schema - represents milliseconds as a branded type
export const DurationMillis = Schema.Number.pipe(
  Schema.positive(),
  Schema.brand('DurationMillis'),
);

export type DurationMillis = Schema.Schema.Type<typeof DurationMillis>;

// WebSocket configuration schema with defaults
export const WebSocketConfigSchema = Schema.Struct({
  url: WebSocketUrl,
  reconnectOptions: Schema.optionalWith(
    Schema.Struct({
      maxAttempts: Schema.Number.pipe(Schema.positive()),
      backoffMultiplier: Schema.Number.pipe(Schema.between(1, 5)),
      initialDelayMillis: DurationMillis,
      maxDelayMillis: DurationMillis,
    }),
    {
      default: () => ({
        maxAttempts: 5,
        backoffMultiplier: 1.5,
        initialDelayMillis: 1000 as DurationMillis, // 1 second
        maxDelayMillis: 60000 as DurationMillis, // 1 minute
      }),
    },
  ),
  connectionTimeoutMillis: Schema.optionalWith(DurationMillis, {
    default: () => 30000 as DurationMillis, // 30 seconds
  }),
  heartbeat: Schema.optionalWith(
    Schema.Struct({
      intervalMillis: DurationMillis,
      timeoutMillis: DurationMillis,
    }),
    {
      default: () => ({
        intervalMillis: 30000 as DurationMillis, // 30 seconds
        timeoutMillis: 5000 as DurationMillis, // 5 seconds
      }),
    },
  ),
});

export type WebSocketConfig = Schema.Schema.Type<typeof WebSocketConfigSchema>;
