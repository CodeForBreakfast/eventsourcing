import { Data } from 'effect';

// Base error for all event sourcing operations
export class EventSourcingError extends Data.TaggedError('EventSourcingError')<
  Readonly<{
    message: string;
    module: 'eventstore' | 'projections' | 'aggregates' | 'websocket';
    code: string;
    context?: unknown;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is EventSourcingError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'EventSourcingError';

  get errorMessage() {
    return `[${this.module}] ${this.code}: ${this.message}${
      this.recoveryHint ? ` (Hint: ${this.recoveryHint})` : ''
    }`;
  }
}

// EventStore specific errors
export class EventStoreError extends Data.TaggedError('EventStoreError')<
  Readonly<{
    operation: 'read' | 'write' | 'subscribe';
    streamId?: string;
    details: string;
    cause?: unknown;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is EventStoreError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'EventStoreError';
}

export class EventStoreConnectionError extends Data.TaggedError('EventStoreConnectionError')<
  Readonly<{
    operation: string;
    connectionString?: string;
    cause: unknown;
    retryable: boolean;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is EventStoreConnectionError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'EventStoreConnectionError';
}

export class EventStoreResourceError extends Data.TaggedError('EventStoreResourceError')<
  Readonly<{
    resource: string;
    operation: string;
    cause: unknown;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is EventStoreResourceError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'EventStoreResourceError';
}

export class ConcurrencyConflictError extends Data.TaggedError('ConcurrencyConflictError')<
  Readonly<{
    streamId: string;
    expectedVersion: number;
    actualVersion: number;
  }>
> {
  static readonly is = (u: unknown): u is ConcurrencyConflictError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'ConcurrencyConflictError';
}

// Projection specific errors
export class ProjectionError extends Data.TaggedError('ProjectionError')<
  Readonly<{
    projectionName: string;
    operation: 'build' | 'rebuild' | 'update' | 'query';
    details: string;
    eventPosition?: number;
    cause?: unknown;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is ProjectionError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'ProjectionError';
}

export class ProjectionStateError extends Data.TaggedError('ProjectionStateError')<
  Readonly<{
    projectionName: string;
    expectedState: string;
    actualState: string;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is ProjectionStateError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'ProjectionStateError';
}

// Snapshot specific errors
export class SnapshotError extends Data.TaggedError('SnapshotError')<
  Readonly<{
    aggregateId: string;
    operation: 'save' | 'load' | 'delete';
    details: string;
    version?: number;
    cause?: unknown;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is SnapshotError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'SnapshotError';
}

export class SnapshotVersionError extends Data.TaggedError('SnapshotVersionError')<
  Readonly<{
    aggregateId: string;
    expectedVersion: number;
    actualVersion: number;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is SnapshotVersionError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'SnapshotVersionError';
}

// WebSocket transport errors
export class WebSocketError extends Data.TaggedError('WebSocketError')<
  Readonly<{
    operation: 'connect' | 'disconnect' | 'send' | 'receive';
    url?: string;
    details: string;
    code?: number;
    cause?: unknown;
    retryable: boolean;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is WebSocketError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'WebSocketError';
}

export class WebSocketProtocolError extends Data.TaggedError('WebSocketProtocolError')<
  Readonly<{
    expectedProtocol: string;
    actualProtocol?: string;
    details: string;
    recoveryHint?: string;
  }>
> {
  static readonly is = (u: unknown): u is WebSocketProtocolError =>
    typeof u === 'object' && u !== null && '_tag' in u && u._tag === 'WebSocketProtocolError';
}

// Type guard helpers
export const isEventSourcingError = (u: unknown): u is EventSourcingError =>
  EventSourcingError.is(u) ||
  EventStoreError.is(u) ||
  EventStoreConnectionError.is(u) ||
  EventStoreResourceError.is(u) ||
  ConcurrencyConflictError.is(u) ||
  ProjectionError.is(u) ||
  ProjectionStateError.is(u) ||
  SnapshotError.is(u) ||
  SnapshotVersionError.is(u) ||
  WebSocketError.is(u) ||
  WebSocketProtocolError.is(u);

// Legacy compatibility helpers
export const resourceError = (resource: string, cause: unknown) =>
  new EventStoreResourceError({
    resource,
    operation: 'access',
    cause,
    recoveryHint: 'Check resource availability and permissions',
  });

// Error creation helpers
export const eventStoreError = {
  read: (streamId: string | undefined, details: string, cause?: unknown) =>
    new EventStoreError({
      operation: 'read',
      ...(streamId !== undefined && { streamId }),
      details,
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Check if the stream exists and you have read permissions',
    }),
  write: (streamId: string | undefined, details: string, cause?: unknown) =>
    new EventStoreError({
      operation: 'write',
      ...(streamId !== undefined && { streamId }),
      details,
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Ensure the stream is not locked and you have write permissions',
    }),
  subscribe: (streamId: string | undefined, details: string, cause?: unknown) =>
    new EventStoreError({
      operation: 'subscribe',
      ...(streamId !== undefined && { streamId }),
      details,
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Check your subscription settings and network connectivity',
    }),
};

export const connectionError = {
  retryable: (operation: string, cause: unknown, connectionString?: string) =>
    new EventStoreConnectionError({
      operation,
      ...(connectionString !== undefined && { connectionString }),
      cause,
      retryable: true,
      recoveryHint: 'The connection will be retried automatically',
    }),
  fatal: (operation: string, cause: unknown, connectionString?: string) =>
    new EventStoreConnectionError({
      operation,
      ...(connectionString !== undefined && { connectionString }),
      cause,
      retryable: false,
      recoveryHint: 'Check your connection settings and database availability',
    }),
};

export const projectionError = {
  build: (projectionName: string, details: string, eventPosition?: number, cause?: unknown) =>
    new ProjectionError({
      projectionName,
      operation: 'build',
      details,
      ...(eventPosition !== undefined && { eventPosition }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Check the projection definition and event handlers',
    }),
  rebuild: (projectionName: string, details: string, eventPosition?: number, cause?: unknown) =>
    new ProjectionError({
      projectionName,
      operation: 'rebuild',
      details,
      ...(eventPosition !== undefined && { eventPosition }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Ensure all events are available and handlers are idempotent',
    }),
  update: (projectionName: string, details: string, eventPosition?: number, cause?: unknown) =>
    new ProjectionError({
      projectionName,
      operation: 'update',
      details,
      ...(eventPosition !== undefined && { eventPosition }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Verify the event handler logic and state consistency',
    }),
  query: (projectionName: string, details: string, cause?: unknown) =>
    new ProjectionError({
      projectionName,
      operation: 'query',
      details,
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Check if the projection is built and accessible',
    }),
};

export const snapshotError = {
  save: (aggregateId: string, details: string, version?: number, cause?: unknown) =>
    new SnapshotError({
      aggregateId,
      operation: 'save',
      details,
      ...(version !== undefined && { version }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Ensure the aggregate state is serializable and storage is available',
    }),
  load: (aggregateId: string, details: string, version?: number, cause?: unknown) =>
    new SnapshotError({
      aggregateId,
      operation: 'load',
      details,
      ...(version !== undefined && { version }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Check if the snapshot exists and is not corrupted',
    }),
  delete: (aggregateId: string, details: string, version?: number, cause?: unknown) =>
    new SnapshotError({
      aggregateId,
      operation: 'delete',
      details,
      ...(version !== undefined && { version }),
      ...(cause !== undefined && { cause }),
      recoveryHint: 'Verify permissions and that the snapshot exists',
    }),
};

export const webSocketError = {
  connect: (url: string | undefined, details: string, code?: number, cause?: unknown) =>
    new WebSocketError({
      operation: 'connect',
      ...(url !== undefined && { url }),
      details,
      ...(code !== undefined && { code }),
      ...(cause !== undefined && { cause }),
      retryable: true,
      recoveryHint: 'Check network connectivity and WebSocket endpoint availability',
    }),
  disconnect: (url: string | undefined, details: string, code?: number, cause?: unknown) =>
    new WebSocketError({
      operation: 'disconnect',
      ...(url !== undefined && { url }),
      details,
      ...(code !== undefined && { code }),
      ...(cause !== undefined && { cause }),
      retryable: false,
      recoveryHint: 'The connection was closed; reconnect if needed',
    }),
  send: (details: string, cause?: unknown) =>
    new WebSocketError({
      operation: 'send',
      details,
      ...(cause !== undefined && { cause }),
      retryable: true,
      recoveryHint: 'Check if the connection is open and the message format is valid',
    }),
  receive: (details: string, cause?: unknown) =>
    new WebSocketError({
      operation: 'receive',
      details,
      ...(cause !== undefined && { cause }),
      retryable: false,
      recoveryHint: 'Verify the message format and protocol compatibility',
    }),
};
