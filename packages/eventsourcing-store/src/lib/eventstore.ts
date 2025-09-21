import { Effect, ParseResult, Schema, Sink, Stream, pipe } from 'effect';
import { EventStreamId, EventNumber, EventStreamPosition, beginning } from './streamTypes';
import type { EventStore } from './services';
import { EventStoreError, ConcurrencyConflictError } from './errors';

/**
 * Gets the current end position of a stream
 *
 * @since 1.0.0
 * @example
 * ```typescript
 * import { currentEnd } from '@codeforbreakfast/eventsourcing-store';
 *
 * const getStreamEnd = currentEnd(eventStore);
 * const endPosition = await Effect.runPromise(getStreamEnd(streamId));
 * ```
 *
 * @param eventStore - The event store service instance
 * @returns A function that takes a stream ID and returns the end position
 * @throws {EventStoreError} If the stream cannot be read
 */
export const currentEnd =
  <TEvent>(eventStore: EventStore<TEvent>) =>
  (streamId: EventStreamId) =>
    pipe(
      beginning(streamId),
      Effect.flatMap((startPos) =>
        pipe(
          eventStore.read(startPos), // Use read for historical events only
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.runCount,
              Effect.map((count) => ({
                streamId,
                eventNumber: count,
              })),
              Effect.flatMap(Schema.decode(EventStreamPosition))
            )
          )
        )
      )
    );

/**
 * Creates an EventStreamPosition from a stream ID and event number
 *
 * @since 1.0.0
 * @example
 * ```typescript
 * import { positionFromEventNumber } from '@codeforbreakfast/eventsourcing-store';
 *
 * const position = await Effect.runPromise(
 *   positionFromEventNumber('stream-123', 5)
 * );
 * ```
 *
 * @param streamId - The stream identifier
 * @param eventNumber - The event number in the stream
 * @returns An Effect that resolves to an EventStreamPosition
 * @throws {ParseResult.ParseError} If the values cannot be parsed into valid position
 */
export const positionFromEventNumber = (streamId: EventStreamId, eventNumber: EventNumber) =>
  pipe(
    {
      streamId,
      eventNumber,
    },
    Schema.decode(EventStreamPosition)
  );

// Re-export service definitions
export type { EventStore } from './services';
export type { EventStore as EventStoreServiceInterface } from './services'; // Alias for backward compatibility
export { EventStoreService } from './services';
// Re-export errors from errors module
export { ConcurrencyConflictError } from './errors';
// StreamEndMovedError is deprecated - re-export as alias for backward compatibility
export { ConcurrencyConflictError as StreamEndMovedError } from './errors';

/**
 * Creates an event store that encodes/decodes events using a schema
 *
 * @since 1.0.0
 * @example
 * ```typescript
 * import { encodedEventStore } from '@codeforbreakfast/eventsourcing-store';
 * import { Schema } from 'effect';
 *
 * const MyEvent = Schema.Struct({
 *   type: Schema.Literal('MyEvent'),
 *   data: Schema.String
 * });
 *
 * const stringEventStore: EventStore<string> = ...;
 * const typedEventStore = encodedEventStore(MyEvent)(stringEventStore);
 * ```
 *
 * @param schema - The schema for encoding/decoding events
 * @returns A function that takes an event store and returns an encoded event store
 * @throws {ParseResult.ParseError} If events cannot be encoded/decoded using the schema
 */
export const encodedEventStore =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (eventstore: Readonly<EventStore<I>>): EventStore<A> =>
    pipe(eventstore, (eventstore) => ({
      write: (toPosition: EventStreamPosition) => {
        // Define the expected error type
        type SinkError = ConcurrencyConflictError | ParseResult.ParseError | EventStoreError;

        // Get a new sink by creating a type-safe transformation pipeline
        const originalSink = eventstore.write(toPosition);

        // Use mapInputEffect to handle input transformation
        return pipe(
          originalSink,
          // The simplest solution is to use the correct typings and cast
          Sink.mapInputEffect((a: A) => Schema.encode(schema)(a))
        ) as unknown as Sink.Sink<EventStreamPosition, A, A, SinkError, never>;
      },
      read: (from: EventStreamPosition) =>
        pipe(
          from,
          eventstore.read,
          Effect.map((stream) =>
            Stream.flatMap((event: I) => pipe(event, Schema.decode(schema)))(stream)
          )
        ),
      subscribe: (from: EventStreamPosition) =>
        pipe(
          from,
          eventstore.subscribe,
          Effect.map((stream) =>
            Stream.flatMap((event: I) => pipe(event, Schema.decode(schema)))(stream)
          )
        ),
    }));
