import { Chunk, Effect, HashMap, Option, PubSub, Stream, SynchronizedRef, pipe } from 'effect';
import {
  EventStreamId,
  EventStreamPosition,
  ConcurrencyConflictError,
} from '@codeforbreakfast/eventsourcing-store';

interface EventStream<V> {
  readonly events: Chunk.Chunk<V>;
  readonly pubsub: PubSub.PubSub<V>;
}

const emptyStream = <V>(): Effect.Effect<EventStream<V>, never, never> =>
  pipe(
    PubSub.bounded<V>(2 ^ 8),
    Effect.map((pubsub) => ({
      events: Chunk.empty<V>(),
      pubsub,
    }))
  );

const createUpdatedEventStream = <V>(
  eventStream: EventStream<V>,
  newEvents: Chunk.Chunk<V>
): EventStream<V> => ({
  events: Chunk.appendAll(newEvents)(eventStream.events),
  pubsub: eventStream.pubsub,
});

const appendToExistingEventStream =
  <V = never>(position: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  (eventStream: EventStream<V>) =>
    eventStream.events.length === position.eventNumber
      ? Effect.succeed(createUpdatedEventStream(eventStream, newEvents))
      : Effect.fail(
          new ConcurrencyConflictError({
            expectedVersion: position.eventNumber,
            actualVersion: eventStream.events.length,
            streamId: position.streamId,
          })
        );

const createOrAppendToStream = <V>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  pipe(emptyStream<V>(), Effect.flatMap(appendToExistingEventStream(streamEnd, newEvents)));

const logAppendedEvents = (newEvents: Chunk.Chunk<unknown>, streamEnd: EventStreamPosition) =>
  Effect.annotateLogs(Effect.logInfo(`Appended events to stream`), {
    newEvents,
    streamEnd,
  });

const publishEventsToSubscribers = <V>(pubsub: PubSub.PubSub<V>, newEvents: Chunk.Chunk<V>) =>
  pipe(pubsub, PubSub.publishAll(newEvents));

const updateEventStreamsById = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  updatedEventStream: EventStream<V>,
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>
) =>
  pipe(
    eventStreamsById,
    HashMap.set(streamEnd.streamId, updatedEventStream),
    Effect.succeed,
    Effect.tap(() => logAppendedEvents(newEvents, streamEnd)),
    Effect.tap(() => publishEventsToSubscribers(updatedEventStream.pubsub, newEvents))
  );

const tagEventsWithStreamId = <V>(newEvents: Chunk.Chunk<V>, streamId: EventStreamId) =>
  pipe(
    newEvents,
    Chunk.map((event) => ({ streamId, event }))
  );

const createUpdatedValue = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>,
  newEvents: Chunk.Chunk<V>,
  streamEnd: EventStreamPosition
): Value<V> => ({
  eventStreamsById,
  allEventsStream: {
    events: Chunk.appendAll(tagEventsWithStreamId(newEvents, streamEnd.streamId))(
      allEventsStream.events
    ),
    pubsub: allEventsStream.pubsub,
  },
});

const appendToEventStream =
  <V = never>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  ({
    eventStreamsById,
    allEventsStream,
  }: Value<V>): Effect.Effect<Value<V>, ConcurrencyConflictError, never> =>
    pipe(
      eventStreamsById,
      HashMap.get(streamEnd.streamId),
      Option.match({
        onSome: appendToExistingEventStream<V>(streamEnd, newEvents),
        onNone: () => createOrAppendToStream(streamEnd, newEvents),
      }),
      Effect.flatMap((updatedEventStream: EventStream<V>) =>
        updateEventStreamsById(eventStreamsById, updatedEventStream, streamEnd, newEvents)
      ),
      Effect.map((eventStreamsById) =>
        createUpdatedValue(eventStreamsById, allEventsStream, newEvents, streamEnd)
      )
    );

const modifyEventStreamsWithEmptyIfMissing = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId,
  emptyStream: EventStream<V>
) =>
  pipe(
    eventStreamsById,
    HashMap.modifyAt(
      streamId,
      Option.match({
        onNone: () => Option.some(emptyStream),
        onSome: (existing: EventStream<V>) => Option.some(existing),
      })
    )
  );

const ensureEventStream =
  <V = never>(streamId: EventStreamId) =>
  ({ eventStreamsById, allEventsStream }: Value<V>): Effect.Effect<Value<V>, never, never> =>
    pipe(
      emptyStream<V>(),
      Effect.map((emptyStream) =>
        modifyEventStreamsWithEmptyIfMissing(eventStreamsById, streamId, emptyStream)
      ),
      Effect.map((eventStreamsById) => ({ eventStreamsById, allEventsStream }))
    );

interface Value<V> {
  readonly eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>;
  readonly allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>;
}

export interface InMemoryStore<V = never> {
  readonly append: (
    to: EventStreamPosition
  ) => (
    events: Chunk.Chunk<V>
  ) => Effect.Effect<EventStreamPosition, ConcurrencyConflictError, never>;
  readonly get: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<V, never, never>, never, never>;
  readonly getHistorical: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<V, never, never>, never, never>;
  readonly getAll: () => Effect.Effect<
    Stream.Stream<{ readonly streamId: EventStreamId; readonly event: V }, never, never>,
    never,
    never
  >;
}

const createLiveEventStream = <V>(eventStream: EventStream<V>): Stream.Stream<V, never, never> =>
  pipe(eventStream.events, Stream.fromChunk, Stream.concat(Stream.fromPubSub(eventStream.pubsub)));

const createHistoricalEventStream = <V>(
  eventStream: EventStream<V>
): Stream.Stream<V, never, never> => pipe(eventStream.events, Stream.fromChunk);

const findEventStreamOrDie = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId
): Effect.Effect<EventStream<V>, never, never> =>
  pipe(
    eventStreamsById,
    HashMap.get(streamId),
    Option.match({
      onNone: () =>
        Effect.dieMessage(
          'Event stream not found - this should not happen because we ensure it exists'
        ),
      onSome: (eventStream: EventStream<V>) => Effect.succeed(eventStream),
    })
  );

const getEventStreamAndCreateLive = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId
): Effect.Effect<Stream.Stream<V, never, never>, never, never> =>
  pipe(
    findEventStreamOrDie(eventStreamsById, streamId),
    Effect.map((eventStream): Stream.Stream<V, never, never> => createLiveEventStream(eventStream))
  );

const getEventStreamAndCreateHistorical = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId
): Effect.Effect<Stream.Stream<V, never, never>, never, never> =>
  pipe(
    findEventStreamOrDie(eventStreamsById, streamId),
    Effect.map(
      (eventStream): Stream.Stream<V, never, never> => createHistoricalEventStream(eventStream)
    )
  );

const appendEventsAndUpdatePosition = <V>(
  value: SynchronizedRef.SynchronizedRef<Value<V>>,
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>
) =>
  pipe(
    value,
    SynchronizedRef.updateEffect(appendToEventStream(streamEnd, newEvents)),
    Effect.map(() => ({
      ...streamEnd,
      eventNumber: streamEnd.eventNumber + newEvents.length,
    }))
  );

const getLiveStreamForId = <V>(
  value: SynchronizedRef.SynchronizedRef<Value<V>>,
  streamId: EventStreamId
) =>
  pipe(
    value,
    SynchronizedRef.updateAndGetEffect(ensureEventStream(streamId)),
    Effect.flatMap(({ eventStreamsById }) =>
      getEventStreamAndCreateLive(eventStreamsById, streamId)
    )
  );

const getHistoricalStreamForId = <V>(
  value: SynchronizedRef.SynchronizedRef<Value<V>>,
  streamId: EventStreamId
) =>
  pipe(
    value,
    SynchronizedRef.updateAndGetEffect(ensureEventStream(streamId)),
    Effect.flatMap(({ eventStreamsById }) =>
      getEventStreamAndCreateHistorical(eventStreamsById, streamId)
    )
  );

const getAllEventsStream = <V>(
  value: SynchronizedRef.SynchronizedRef<Value<V>>
): Effect.Effect<
  Stream.Stream<{ readonly streamId: EventStreamId; readonly event: V }, never, never>,
  never,
  never
> =>
  pipe(
    value,
    SynchronizedRef.get,
    Effect.map(({ allEventsStream }) => createLiveEventStream(allEventsStream))
  );

export const make = <V>() =>
  pipe(
    emptyStream<{ readonly streamId: EventStreamId; readonly event: V }>(),
    Effect.flatMap(
      (allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>) =>
        SynchronizedRef.make<Value<V>>({
          eventStreamsById: HashMap.empty<EventStreamId, EventStream<V>>(),
          allEventsStream,
        })
    ),
    Effect.map(
      (value: SynchronizedRef.SynchronizedRef<Value<V>>): InMemoryStore<V> => ({
        append: (streamEnd) => (newEvents) =>
          appendEventsAndUpdatePosition(value, streamEnd, newEvents),
        get: (streamId: EventStreamId) => getLiveStreamForId(value, streamId),
        getHistorical: (streamId: EventStreamId) => getHistoricalStreamForId(value, streamId),
        getAll: () => getAllEventsStream(value),
      })
    )
  );
