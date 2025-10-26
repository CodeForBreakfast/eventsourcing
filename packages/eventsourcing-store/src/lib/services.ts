import { Effect, ParseResult, Sink, Stream } from 'effect';
import { EventStreamPosition, type StreamEvent } from './streamTypes';
import {
  EventStoreError,
  ConcurrencyConflictError,
  SnapshotError,
  ProjectionError,
} from './errors';

// EventStore service interface - Simplified API
export interface EventStore<TEvent> {
  /**
   * Append events to the end of a stream at a specific position
   * @param to The expected position in the stream (used for optimistic concurrency control)
   * @returns A sink that appends events and returns the new stream position
   * @throws {ConcurrencyConflictError} If the stream position doesn't match the expected position
   */
  readonly append: (
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

  /**
   * Subscribe to live events from ALL streams
   * Returns only new events committed after subscription starts (no historical replay)
   * Each event includes its position (streamId + eventNumber)
   *
   * @returns A stream of events from all streams with their positions
   */
  readonly subscribeAll: () => Effect.Effect<
    Stream.Stream<StreamEvent<TEvent>, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}

// Projection Store service interface
export interface ProjectionStore<TState> {
  readonly get: (id: string) => Effect.Effect<TState | null, ProjectionError>;
  readonly save: (id: string, state: TState) => Effect.Effect<void, ProjectionError>;
  readonly delete: (id: string) => Effect.Effect<void, ProjectionError>;
  readonly list: () => Effect.Effect<readonly string[], ProjectionError>;
  readonly clear: () => Effect.Effect<void, ProjectionError>;
}

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
  ) => Effect.Effect<
    { readonly version: number; readonly snapshot: TSnapshot } | null,
    SnapshotError
  >;
  readonly delete: (aggregateId: string) => Effect.Effect<void, SnapshotError>;
  readonly list: (aggregateId: string) => Effect.Effect<readonly number[], SnapshotError>;
}
