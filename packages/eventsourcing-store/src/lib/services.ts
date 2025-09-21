import { Effect, ParseResult, Sink, Stream } from 'effect';
import { EventStreamId, EventStreamPosition } from './streamTypes';
import {
  EventStoreError,
  ConcurrencyConflictError,
  SnapshotError,
  ProjectionError,
} from './errors';

// ReadOptions for unified EventStore read API
export interface ReadOptions {
  readonly fromEventNumber?: number;
  readonly toEventNumber?: number;
  readonly direction?: 'forward' | 'backward';
  readonly batchSize?: number;
}

// Extended read parameters for flexible event stream reading
export interface ReadParams extends ReadOptions {
  readonly streamId: EventStreamId;
  readonly fromEventNumber?: number;
}

// EventStore service interface
export interface EventStore<TEvent> {
  readonly write: (
    to: EventStreamPosition
  ) => Sink.Sink<
    EventStreamPosition,
    TEvent,
    TEvent,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >;
  readonly read: (
    params: ReadParams | EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
  readonly readHistorical: (
    params: ReadParams | EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}

// Create EventStore service tag - generic version must be created per use case
export class EventStoreService extends Effect.Tag('@eventsourcing/EventStore')<
  EventStoreService,
  EventStore<unknown>
>() {}

// Projection Store service interface
export interface ProjectionStore<TState> {
  readonly get: (id: string) => Effect.Effect<TState | null, ProjectionError>;
  readonly save: (id: string, state: TState) => Effect.Effect<void, ProjectionError>;
  readonly delete: (id: string) => Effect.Effect<void, ProjectionError>;
  readonly list: () => Effect.Effect<readonly string[], ProjectionError>;
  readonly clear: () => Effect.Effect<void, ProjectionError>;
}

export class ProjectionStoreService extends Effect.Tag('@eventsourcing/ProjectionStore')<
  ProjectionStoreService,
  ProjectionStore<unknown>
>() {}

// Snapshot Store service interface
export interface SnapshotStore<TSnapshot> {
  readonly save: (
    aggregateId: string,
    version: number,
    snapshot: TSnapshot
  ) => Effect.Effect<void, SnapshotError>;
  readonly load: (
    aggregateId: string,
    version?: number
  ) => Effect.Effect<{ version: number; snapshot: TSnapshot } | null, SnapshotError>;
  readonly delete: (aggregateId: string) => Effect.Effect<void, SnapshotError>;
  readonly list: (aggregateId: string) => Effect.Effect<readonly number[], SnapshotError>;
}

export class SnapshotStoreService extends Effect.Tag('@eventsourcing/SnapshotStore')<
  SnapshotStoreService,
  SnapshotStore<unknown>
>() {}

// Note: EventStore type is exported from eventstore.ts for backward compatibility
