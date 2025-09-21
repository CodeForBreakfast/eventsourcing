import { Effect, ParseResult, Sink, Stream } from 'effect';
import { EventStreamPosition } from './streamTypes';
import {
  EventStoreError,
  ConcurrencyConflictError,
  SnapshotError,
  ProjectionError,
} from './errors';

// EventStore service interface - Simplified API
export interface EventStore<TEvent> {
  /**
   * Write events to a stream at a specific position
   * @param to The position in the stream to write to
   * @returns A sink that writes events and returns the new stream position
   */
  readonly write: (
    to: EventStreamPosition
  ) => Sink.Sink<
    EventStreamPosition,
    TEvent,
    TEvent,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >;

  /**
   * Read historical events from a stream starting at a position
   * This returns only events that have already been written - no live updates
   * Use Stream combinators for filtering, pagination, reverse order, etc.
   * @param from The position in the stream to start reading from
   * @returns A stream of historical events
   */
  readonly read: (
    from: EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;

  /**
   * Subscribe to a stream for both historical and live events
   * Returns all historical events from the given position, then continues with live updates
   * @param from The position in the stream to start reading from
   * @returns A stream of historical events followed by live updates
   */
  readonly subscribe: (
    from: EventStreamPosition
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
