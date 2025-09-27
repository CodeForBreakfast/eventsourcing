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

const appendToExistingEventStream =
  <V = never>(position: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  (eventStream: Readonly<EventStream<V>>) =>
    eventStream.events.length === position.eventNumber
      ? Effect.succeed(
          pipe(eventStream, (eventStream) => ({
            events: Chunk.appendAll(newEvents)(eventStream.events),
            pubsub: eventStream.pubsub,
          }))
        )
      : Effect.fail(
          new ConcurrencyConflictError({
            expectedVersion: position.eventNumber,
            actualVersion: eventStream.events.length,
            streamId: position.streamId,
          })
        );

const appendToEventStream =
  <V = never>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  ({
    eventStreamsById,
    allEventsStream,
  }: Readonly<Value<V>>): Effect.Effect<Value<V>, ConcurrencyConflictError, never> =>
    pipe(
      eventStreamsById,
      HashMap.get(streamEnd.streamId),
      Option.match({
        onSome: appendToExistingEventStream<V>(streamEnd, newEvents),
        onNone: () =>
          pipe(emptyStream<V>(), Effect.flatMap(appendToExistingEventStream(streamEnd, newEvents))),
      }),
      Effect.flatMap((updatedEventStream: Readonly<EventStream<V>>) =>
        pipe(
          eventStreamsById,
          HashMap.set(streamEnd.streamId, updatedEventStream),
          Effect.succeed,
          Effect.tap(() =>
            Effect.annotateLogs(Effect.logInfo(`Appended events to stream`), {
              newEvents,
              streamEnd,
            })
          ),
          Effect.tap(() => pipe(updatedEventStream.pubsub, PubSub.publishAll(newEvents)))
        )
      ),
      Effect.map((eventStreamsById) => ({
        eventStreamsById,
        allEventsStream: {
          events: Chunk.appendAll(
            pipe(
              newEvents,
              Chunk.map((event) => ({ streamId: streamEnd.streamId, event }))
            )
          )(allEventsStream.events),
          pubsub: allEventsStream.pubsub,
        },
      }))
    );

const ensureEventStream =
  <V = never>(streamId: EventStreamId) =>
  ({
    eventStreamsById,
    allEventsStream,
  }: Readonly<Value<V>>): Effect.Effect<Value<V>, never, never> =>
    pipe(
      emptyStream<V>(),
      Effect.map((emptyStream) =>
        pipe(
          eventStreamsById,
          HashMap.modifyAt(
            streamId,
            Option.match({
              onNone: () => Option.some(emptyStream),
              onSome: (existing: Readonly<EventStream<V>>) => Option.some(existing),
            })
          )
        )
      ),
      Effect.map((eventStreamsById) => ({ eventStreamsById, allEventsStream }))
    );

interface Value<V> {
  readonly eventStreamsById: HashMap.HashMap<EventStreamId, EventStream<V>>;
  readonly allEventsStream: EventStream<{ streamId: EventStreamId; event: V }>;
}

export class InMemoryStore<V = never> {
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
    Stream.Stream<{ streamId: EventStreamId; event: V }, never, never>,
    never,
    never
  >;

  private readonly value: SynchronizedRef.SynchronizedRef<Value<V>>;

  constructor(value: SynchronizedRef.SynchronizedRef<Value<V>>) {
    this.value = value;
    this.append = (streamEnd) => (newEvents) =>
      pipe(
        this.value,
        SynchronizedRef.updateEffect(appendToEventStream(streamEnd, newEvents)),
        Effect.map(() => ({
          ...streamEnd,
          eventNumber: streamEnd.eventNumber + newEvents.length,
        }))
      );

    this.get = (streamId: EventStreamId) =>
      pipe(
        this.value,
        SynchronizedRef.updateAndGetEffect(ensureEventStream(streamId)),
        Effect.flatMap(({ eventStreamsById }) =>
          pipe(
            eventStreamsById,
            HashMap.get(streamId),
            Option.match({
              onNone: () =>
                Effect.dieMessage(
                  'Event stream not found - this should not happen because we ensure it exists'
                ),
              onSome: (eventStream: Readonly<EventStream<V>>) =>
                Effect.succeed(
                  pipe(
                    eventStream.events,
                    Stream.fromChunk,
                    Stream.concat(Stream.fromPubSub(eventStream.pubsub))
                  )
                ),
            })
          )
        )
      );

    this.getHistorical = (streamId: EventStreamId) =>
      pipe(
        this.value,
        SynchronizedRef.updateAndGetEffect(ensureEventStream(streamId)),
        Effect.flatMap(({ eventStreamsById }) =>
          pipe(
            eventStreamsById,
            HashMap.get(streamId),
            Option.match({
              onNone: () =>
                Effect.dieMessage(
                  'Event stream not found - this should not happen because we ensure it exists'
                ),
              onSome: (eventStream: Readonly<EventStream<V>>) =>
                Effect.succeed(pipe(eventStream.events, Stream.fromChunk)),
            })
          )
        )
      );

    this.getAll = () =>
      pipe(
        this.value,
        SynchronizedRef.get,
        Effect.map(({ allEventsStream }) =>
          pipe(
            allEventsStream.events,
            Stream.fromChunk,
            Stream.concat(Stream.fromPubSub(allEventsStream.pubsub))
          )
        )
      );
  }
}

export const make = <V>() =>
  pipe(
    emptyStream<{ streamId: EventStreamId; event: V }>(),
    Effect.flatMap(
      (allEventsStream: Readonly<EventStream<{ streamId: EventStreamId; event: V }>>) =>
        SynchronizedRef.make<Value<V>>({
          eventStreamsById: HashMap.empty<EventStreamId, EventStream<V>>(),
          allEventsStream,
        })
    ),
    Effect.map((value: SynchronizedRef.SynchronizedRef<Value<V>>) => new InMemoryStore<V>(value))
  );
