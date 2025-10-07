/**
 * This is a minimal version of the EventStore interface with type parameters that are compatible
 * with the projections package. It is used to wrap the actual EventStore implementation.
 */
import { Effect, ParseResult, Stream } from 'effect';
import {
  EventNumber,
  EventStreamId,
  EventStreamPosition,
  type EventStore as FullEventStore,
} from '@codeforbreakfast/eventsourcing-store';
import { EventStoreError } from '@codeforbreakfast/eventsourcing-store';

/**
 * A simplified EventStore interface for projections.
 * This is a subset of the full EventStore interface, containing only what projections need.
 * Projections only need to read historical events, not subscribe to live updates.
 */
export interface ProjectionEventStore<TEvent> {
  readonly read: (
    from: EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}

/**
 * Make a projection-specific view of an EventStore
 */
export const makeProjectionEventStore = <TEvent>(
  original: FullEventStore<TEvent>
): ProjectionEventStore<TEvent> => ({
  read: original.read,
});

export { EventNumber, EventStreamId, EventStreamPosition, EventStoreError };
