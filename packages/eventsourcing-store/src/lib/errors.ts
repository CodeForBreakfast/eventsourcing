import { Data } from 'effect';

// Base error for all event sourcing operations
export class EventSourcingError extends Data.TaggedError('EventSourcingError')<
  Readonly<{
    readonly message: string;
    readonly module: 'eventstore' | 'projections' | 'aggregates' | 'websocket';
    readonly code: string;
    readonly context?: unknown;
    readonly recoveryHint?: string;
  }>
> {
  get errorMessage() {
    return `[${this.module}] ${this.code}: ${this.message}${
      this.recoveryHint ? ` (Hint: ${this.recoveryHint})` : ''
    }`;
  }
}

// EventStore specific errors
export class EventStoreError extends Data.TaggedError('EventStoreError')<
  Readonly<{
    readonly operation: 'read' | 'write' | 'subscribe';
    readonly streamId?: string;
    readonly details: string;
    readonly cause?: unknown;
    readonly recoveryHint?: string;
  }>
> {}

export class EventStoreConnectionError extends Data.TaggedError('EventStoreConnectionError')<
  Readonly<{
    readonly operation: string;
    readonly connectionString?: string;
    readonly cause: unknown;
    readonly retryable: boolean;
    readonly recoveryHint?: string;
  }>
> {}

export class EventStoreResourceError extends Data.TaggedError('EventStoreResourceError')<
  Readonly<{
    readonly resource: string;
    readonly operation: string;
    readonly cause: unknown;
    readonly recoveryHint?: string;
  }>
> {}

export class ConcurrencyConflictError extends Data.TaggedError('ConcurrencyConflictError')<
  Readonly<{
    readonly streamId: string;
    readonly expectedVersion: number;
    readonly actualVersion: number;
  }>
> {}

// Projection specific errors
export class ProjectionError extends Data.TaggedError('ProjectionError')<
  Readonly<{
    readonly projectionName: string;
    readonly operation: 'build' | 'rebuild' | 'update' | 'query';
    readonly details: string;
    readonly eventPosition?: number;
    readonly cause?: unknown;
    readonly recoveryHint?: string;
  }>
> {}

export class ProjectionStateError extends Data.TaggedError('ProjectionStateError')<
  Readonly<{
    readonly projectionName: string;
    readonly expectedState: string;
    readonly actualState: string;
    readonly recoveryHint?: string;
  }>
> {}

// Snapshot specific errors
export class SnapshotError extends Data.TaggedError('SnapshotError')<
  Readonly<{
    readonly aggregateId: string;
    readonly operation: 'save' | 'load' | 'delete';
    readonly details: string;
    readonly version?: number;
    readonly cause?: unknown;
    readonly recoveryHint?: string;
  }>
> {}

export class SnapshotVersionError extends Data.TaggedError('SnapshotVersionError')<
  Readonly<{
    readonly aggregateId: string;
    readonly expectedVersion: number;
    readonly actualVersion: number;
    readonly recoveryHint?: string;
  }>
> {}

// WebSocket transport errors
export class WebSocketError extends Data.TaggedError('WebSocketError')<
  Readonly<{
    readonly operation: 'connect' | 'disconnect' | 'send' | 'receive';
    readonly url?: string;
    readonly details: string;
    readonly code?: number;
    readonly cause?: unknown;
    readonly retryable: boolean;
    readonly recoveryHint?: string;
  }>
> {}

export class WebSocketProtocolError extends Data.TaggedError('WebSocketProtocolError')<
  Readonly<{
    readonly expectedProtocol: string;
    readonly actualProtocol?: string;
    readonly details: string;
    readonly recoveryHint?: string;
  }>
> {}

// Type guard helper using tag-based discrimination
export const isEventSourcingError = (
  u: unknown
): u is
  | EventSourcingError
  | EventStoreError
  | EventStoreConnectionError
  | EventStoreResourceError
  | ConcurrencyConflictError
  | ProjectionError
  | ProjectionStateError
  | SnapshotError
  | SnapshotVersionError
  | WebSocketError
  | WebSocketProtocolError => {
  if (typeof u !== 'object' || u === null || !('_tag' in u)) return false;
  const tag = (u as { readonly _tag: unknown })._tag;
  return [
    'EventSourcingError',
    'EventStoreError',
    'EventStoreConnectionError',
    'EventStoreResourceError',
    'ConcurrencyConflictError',
    'ProjectionError',
    'ProjectionStateError',
    'SnapshotError',
    'SnapshotVersionError',
    'WebSocketError',
    'WebSocketProtocolError',
  ].includes(tag as string);
};

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
