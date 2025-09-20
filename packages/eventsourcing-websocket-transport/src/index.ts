// WebSocket connection types
export type {
  DisconnectedWebSocket,
  ConnectingWebSocket,
  ConnectedWebSocket,
  WebSocketConnection,
  WebSocketServiceInterface,
} from './lib/webSocketConnection';

// WebSocket connection implementation
export {
  createWebSocketConnection,
  WebSocketService,
  WebSocketServiceLive,
  ConnectionError,
  SendError,
  ReceiveError,
} from './lib/webSocketConnection';

// Core types
export type {
  WebSocketUrl,
  OutgoingMessage,
  MessageId,
  ConnectionInfo,
  SendResult,
  DisconnectResult,
  DisconnectReason,
  WebSocketReadyState,
  WebSocketCloseCode,
  StandardCloseCode,
  WebSocketMessage,
  TypedWebSocketEventMap,
  TypedWebSocketEventHandler,
  WebSocketConfig,
  DurationMillis,
} from './lib/types';

// Schema exports for runtime validation
export {
  WebSocketUrl as WebSocketUrlSchema,
  OutgoingMessage as OutgoingMessageSchema,
  MessageId as MessageIdSchema,
  WebSocketReadyStateSchema,
  WebSocketReadyStateMap,
  getReadyStateLabel,
  WebSocketCloseCodeSchema,
  StandardCloseCodes,
  WebSocketMessageSchema,
  WebSocketConfigSchema,
  DurationMillis as DurationMillisSchema,
} from './lib/types';

// Metrics types and utilities
export type {
  ConnectionMetrics,
  ConnectionHealth,
  ConnectionQuality,
  MetricsTracker,
} from './lib/connectionMetrics';

export {
  createMetricsTracker,
  createEmptyMetricsTracker,
  formatMetrics,
} from './lib/connectionMetrics';

// Event transport types and interfaces
export * from './lib/event-transport';
