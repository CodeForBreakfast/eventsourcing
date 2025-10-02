import { Effect, ParseResult, Schema, Sink, Stream, pipe } from 'effect';
import { EventStreamId, EventNumber, EventStreamPosition, beginning } from './streamTypes';
import type { EventStore } from './services';
import { EventStoreError, ConcurrencyConflictError } from './errors';

const countEventsAndCreatePosition = (
  streamId: EventStreamId,
  stream: Stream.Stream<unknown, unknown>
) =>
  pipe(
    stream,
    Stream.runCount,
    Effect.map((count) => ({
      streamId,
      eventNumber: count,
    })),
    Effect.flatMap(Schema.decode(EventStreamPosition))
  );

const readAndCountEvents = <TEvent>(
  eventStore: EventStore<TEvent>,
  streamId: EventStreamId,
  startPos: EventStreamPosition
) =>
  pipe(
    eventStore.read(startPos),
    Effect.flatMap((stream) => countEventsAndCreatePosition(streamId, stream))
  );

/**
 * Gets the current end position of a stream
 *
 * @since 0.5.0
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
      Effect.flatMap((startPos) => readAndCountEvents(eventStore, streamId, startPos))
    );

/**
 * Creates an EventStreamPosition from a stream ID and event number
 *
 * @since 0.5.0
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
export { type EventStore, EventStore as EventStoreTag } from './services';
// Re-export errors from errors module
export { ConcurrencyConflictError } from './errors';

const decodeEvent = <A, I>(schema: Schema.Schema<A, I>, event: I) =>
  pipe(event, Schema.decode(schema));

const decodeStreamEvents = <A, I>(
  schema: Schema.Schema<A, I>,
  stream: Stream.Stream<I, ParseResult.ParseError | EventStoreError>
): Stream.Stream<A, ParseResult.ParseError | EventStoreError> =>
  Stream.flatMap((event: I) => decodeEvent(schema, event))(stream);

const readAndDecodeEvents = <A, I>(
  schema: Schema.Schema<A, I>,
  eventstore: Readonly<EventStore<I>>,
  from: EventStreamPosition
) =>
  pipe(
    from,
    eventstore.read,
    Effect.map((stream) => decodeStreamEvents(schema, stream))
  );

const subscribeAndDecodeEvents = <A, I>(
  schema: Schema.Schema<A, I>,
  eventstore: Readonly<EventStore<I>>,
  from: EventStreamPosition
) =>
  pipe(
    from,
    eventstore.subscribe,
    Effect.map((stream) => decodeStreamEvents(schema, stream))
  );

const createEncodingSink = <A, I>(
  schema: Schema.Schema<A, I>,
  originalSink: Sink.Sink<
    EventStreamPosition,
    I,
    I,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >
) => {
  type SinkError = ConcurrencyConflictError | ParseResult.ParseError | EventStoreError;
  return pipe(
    originalSink,
    Sink.mapInputEffect((a: A) => Schema.encode(schema)(a))
  ) as unknown as Sink.Sink<EventStreamPosition, A, A, SinkError, never>;
};

/**
 * Creates an event store that encodes/decodes events using a schema
 *
 * @since 0.5.0
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
  (eventstore: Readonly<EventStore<I>>): EventStore<A> => ({
    append: (toPosition: EventStreamPosition) =>
      createEncodingSink(schema, eventstore.append(toPosition)),
    read: (from: EventStreamPosition) => readAndDecodeEvents(schema, eventstore, from),
    subscribe: (from: EventStreamPosition) => subscribeAndDecodeEvents(schema, eventstore, from),
  });
