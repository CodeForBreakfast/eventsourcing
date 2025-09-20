/**
 * This is a minimal version of the EventStore interface with type parameters that are compatible
 * with the projections package. It is used to wrap the actual EventStore implementation.
 */
import { Effect, ParseResult, Stream } from 'effect';
import {
  EventNumber,
  EventStreamId,
  EventStreamPosition,
  type EventStore as OriginalEventStore,
} from '@codeforbreakfast/eventsourcing-store';
import { EventStoreError } from '@codeforbreakfast/eventsourcing-store';

/**
 * A wrapper around the EventStore interface that matches the type parameter expectations
 * of the projections package.
 */
export interface EventStore<TEvent> {
  readonly read: (
    from: EventStreamPosition,
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
  readonly readHistorical: (
    from: EventStreamPosition,
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}

/**
 * Create a compatible version of EventStore that works with the projections package
 */
export const createCompatibleEventStore = <TEvent>(
  original: OriginalEventStore<TEvent>,
): EventStore<TEvent> => ({
  read: (from: EventStreamPosition) => original.read(from),
  readHistorical: (from: EventStreamPosition) => original.readHistorical(from),
});

export { EventNumber, EventStreamId, EventStreamPosition, EventStoreError };
