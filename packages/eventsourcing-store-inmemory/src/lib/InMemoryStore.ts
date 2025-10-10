import {
  Chunk,
  Effect,
  HashMap,
  Match,
  Option,
  PubSub,
  Stream,
  SynchronizedRef,
  pipe,
} from 'effect';
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
    2 ^ 8,
    PubSub.bounded<V>,
    Effect.map((pubsub) => ({
      events: Chunk.empty<V>(),
      pubsub,
    }))
  );

const createUpdatedEventStream = <V>(
  eventStream: EventStream<V>,
  newEvents: Chunk.Chunk<V>
): EventStream<V> => ({
  events: pipe(eventStream.events, Chunk.appendAll(newEvents)),
  pubsub: eventStream.pubsub,
});

const appendToExistingEventStream =
  <V = never>(position: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  (eventStream: EventStream<V>) =>
    pipe(
      eventStream.events.length === position.eventNumber,
      Match.value,
      Match.when(true, () => Effect.succeed(createUpdatedEventStream(eventStream, newEvents))),
      Match.when(false, () =>
        Effect.fail(
          new ConcurrencyConflictError({
            expectedVersion: position.eventNumber,
            actualVersion: eventStream.events.length,
            streamId: position.streamId,
          })
        )
      ),
      Match.exhaustive
    );

const createOrAppendToStream = <V>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  pipe(emptyStream<V>(), Effect.flatMap(appendToExistingEventStream(streamEnd, newEvents)));

const logAppendedEvents = (newEvents: Chunk.Chunk<unknown>, streamEnd: EventStreamPosition) =>
  Effect.annotateLogs(Effect.logInfo(`Appended events to stream`), {
    newEvents,
    streamEnd,
  });

const publishEventsToStream = <V>(pubsub: PubSub.PubSub<V>, newEvents: Chunk.Chunk<V>) =>
  pipe(pubsub, PubSub.publishAll(newEvents));

const updateEventStreamsById =
  <V>(
    updatedEventStream: EventStream<V>,
    streamEnd: EventStreamPosition,
    newEvents: Chunk.Chunk<V>
  ) =>
  (eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>) =>
    pipe(
      eventStreamsById,
      HashMap.set(streamEnd.streamId, updatedEventStream),
      Effect.succeed,
      Effect.tap(() => logAppendedEvents(newEvents, streamEnd)),
      Effect.tap(() => publishEventsToStream(updatedEventStream.pubsub, newEvents))
    );

const tagEventsWithStreamId = <V>(newEvents: Chunk.Chunk<V>, streamId: EventStreamId) =>
  Chunk.map(newEvents, (event) => ({ streamId, event }));

const createUpdatedValue =
  <V>(
    allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>,
    newEvents: Chunk.Chunk<V>,
    streamEnd: EventStreamPosition
  ) =>
  (eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>): Value<V> => ({
    eventStreamsById,
    allEventsStream: {
      events: pipe(
        allEventsStream.events,
        Chunk.appendAll(tagEventsWithStreamId(newEvents, streamEnd.streamId))
      ),
      pubsub: allEventsStream.pubsub,
    },
  });

const updateEventStreamsByIdForEventStream = updateEventStreamsById;

const applyUpdatedEventStreamToValue =
  <V>(
    allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>,
    streamEnd: EventStreamPosition,
    newEvents: Chunk.Chunk<V>,
    eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>
  ) =>
  (updatedEventStream: EventStream<V>) =>
    pipe(
      eventStreamsById,
      updateEventStreamsByIdForEventStream(updatedEventStream, streamEnd, newEvents),
      Effect.map(createUpdatedValue(allEventsStream, newEvents, streamEnd))
    );

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
      Effect.flatMap(
        applyUpdatedEventStreamToValue(allEventsStream, streamEnd, newEvents, eventStreamsById)
      )
    );

const modifyEventStreamsWithEmptyIfMissing =
  <V>(streamId: EventStreamId, emptyStream: EventStream<V>) =>
  (eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>) =>
    HashMap.modifyAt(
      eventStreamsById,
      streamId,
      Option.match({
        onNone: () => Option.some(emptyStream),
        onSome: Option.some,
      })
    );

const modifyEventStreamsForEnsure = modifyEventStreamsWithEmptyIfMissing;

const modifyEventStreamsByIdWithEmptyStream = <V>(
  streamId: EventStreamId,
  emptyStream: EventStream<V>,
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>
): Effect.Effect<HashMap.HashMap<EventStreamId, EventStream<V>>, never, never> =>
  pipe(eventStreamsById, modifyEventStreamsForEnsure(streamId, emptyStream), Effect.succeed);

const buildValueFromEventStreamsById =
  <V>(allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>) =>
  (eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>): Value<V> => ({
    eventStreamsById,
    allEventsStream,
  });

const ensureEventStream =
  <V = never>(streamId: EventStreamId) =>
  ({ eventStreamsById, allEventsStream }: Value<V>): Effect.Effect<Value<V>, never, never> =>
    pipe(
      emptyStream<V>(),
      Effect.flatMap((emptyStream) =>
        modifyEventStreamsByIdWithEmptyStream(streamId, emptyStream, eventStreamsById)
      ),
      Effect.map(buildValueFromEventStreamsById(allEventsStream))
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
      onSome: Effect.succeed,
    })
  );

const getEventStreamAndCreateLive = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId
): Effect.Effect<Stream.Stream<V, never, never>, never, never> =>
  pipe(findEventStreamOrDie(eventStreamsById, streamId), Effect.map(createLiveEventStream));

const getEventStreamAndCreateHistorical = <V>(
  eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>,
  streamId: EventStreamId
): Effect.Effect<Stream.Stream<V, never, never>, never, never> =>
  pipe(findEventStreamOrDie(eventStreamsById, streamId), Effect.map(createHistoricalEventStream));

const appendEventsAndUpdatePosition =
  <V>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  (value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
    pipe(
      value,
      SynchronizedRef.updateEffect(appendToEventStream(streamEnd, newEvents)),
      Effect.as({
        ...streamEnd,
        eventNumber: streamEnd.eventNumber + newEvents.length,
      })
    );

const getLiveStreamForId =
  <V>(streamId: EventStreamId) =>
  (value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
    pipe(
      value,
      SynchronizedRef.updateAndGetEffect(ensureEventStream(streamId)),
      Effect.flatMap(({ eventStreamsById }) =>
        getEventStreamAndCreateLive(eventStreamsById, streamId)
      )
    );

const getHistoricalStreamForId =
  <V>(streamId: EventStreamId) =>
  (value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
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

const appendForStore =
  <V>(value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
  (streamEnd: EventStreamPosition) =>
  (newEvents: Chunk.Chunk<V>) =>
    pipe(value, appendEventsAndUpdatePosition(streamEnd, newEvents));

const getForStore =
  <V>(value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
  (streamId: EventStreamId) =>
    pipe(value, getLiveStreamForId(streamId));

const getHistoricalForStore =
  <V>(value: SynchronizedRef.SynchronizedRef<Value<V>>) =>
  (streamId: EventStreamId) =>
    pipe(value, getHistoricalStreamForId(streamId));

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
        append: appendForStore(value),
        get: getForStore(value),
        getHistorical: getHistoricalForStore(value),
        getAll: () => getAllEventsStream(value),
      })
    )
  );
