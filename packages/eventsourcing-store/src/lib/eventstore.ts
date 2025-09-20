import { Effect, ParseResult, Schema, Sink, Stream, pipe } from 'effect';
import {
  EventStreamId,
  EventNumber,
  EventStreamPosition,
  beginning,
} from './streamTypes';
import type { ReadParams } from './services';
import { EventStoreError, ConcurrencyConflictError } from './errors';

export const currentEnd =
  <TEvent>(eventStore: EventStore<TEvent>) =>
  (streamId: EventStreamId) =>
    pipe(
      beginning(streamId),
      Effect.flatMap((startPos) =>
        pipe(
          eventStore.readHistorical(startPos),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.runCount,
              Effect.map((count) => ({
                streamId,
                eventNumber: count,
              })),
              Effect.flatMap(Schema.decode(EventStreamPosition)),
            ),
          ),
        ),
      ),
    );

export const positionFromEventNumber = (
  streamId: EventStreamId,
  eventNumber: EventNumber,
) =>
  pipe(
    {
      streamId,
      eventNumber,
    },
    Schema.decode(EventStreamPosition),
  );

/**
 * @deprecated Use EventStoreServiceInterface from './services' instead
 */
export interface EventStore<TEvent> {
  readonly write: (
    to: EventStreamPosition,
  ) => Sink.Sink<
    EventStreamPosition,
    TEvent,
    TEvent,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >;
  readonly read: (
    params: ReadParams | EventStreamPosition,
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
  readonly readHistorical: (
    params: ReadParams | EventStreamPosition,
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}

// Re-export service definitions for backward compatibility
export type { EventStoreServiceInterface } from './services';
export { EventStoreService } from './services';
// Re-export errors from errors module
export { ConcurrencyConflictError, StreamEndMovedError } from './errors';

// I = string
// A = event

export const encodedEventStore =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (eventstore: Readonly<EventStore<I>>): EventStore<A> =>
    pipe(eventstore, (eventstore) => ({
      write: (toPosition: EventStreamPosition) => {
        // Define the expected error type
        type SinkError =
          | ConcurrencyConflictError
          | ParseResult.ParseError
          | EventStoreError;

        // Get a new sink by creating a type-safe transformation pipeline
        const originalSink = eventstore.write(toPosition);

        // Use mapInputEffect to handle input transformation
        return pipe(
          originalSink,
          // The simplest solution is to use the correct typings and cast
          Sink.mapInputEffect((a: A) => Schema.encode(schema)(a)),
        ) as unknown as Sink.Sink<EventStreamPosition, A, A, SinkError, never>;
      },
      read: (params: ReadParams | EventStreamPosition) =>
        pipe(
          params,
          eventstore.read,
          Effect.map((stream) =>
            Stream.flatMap((event: I) => pipe(event, Schema.decode(schema)))(
              stream,
            ),
          ),
        ),
      readHistorical: (params: ReadParams | EventStreamPosition) =>
        pipe(
          params,
          eventstore.readHistorical,
          Effect.map((stream) =>
            Stream.flatMap((event: I) => pipe(event, Schema.decode(schema)))(
              stream,
            ),
          ),
        ),
    }));
