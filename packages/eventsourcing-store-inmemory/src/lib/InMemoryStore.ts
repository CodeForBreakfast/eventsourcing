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
  // eslint-disable-next-line functional/prefer-immutable-types
  (eventStream: EventStream<V>) =>
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
  // eslint-disable-next-line functional/prefer-immutable-types
  ({
    eventStreamsById,
    allEventsStream,
  }: Value<V>): Effect.Effect<Value<V>, ConcurrencyConflictError, never> =>
    pipe(
      eventStreamsById,
      HashMap.get(streamEnd.streamId),
      Option.match({
        onSome: appendToExistingEventStream<V>(streamEnd, newEvents),
        onNone: () =>
          pipe(emptyStream<V>(), Effect.flatMap(appendToExistingEventStream(streamEnd, newEvents))),
      }),
      // eslint-disable-next-line functional/prefer-immutable-types
      Effect.flatMap((updatedEventStream: EventStream<V>) =>
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
  // eslint-disable-next-line functional/prefer-immutable-types
  ({ eventStreamsById, allEventsStream }: Value<V>): Effect.Effect<Value<V>, never, never> =>
    pipe(
      emptyStream<V>(),
      Effect.map((emptyStream) =>
        pipe(
          eventStreamsById,
          HashMap.modifyAt(
            streamId,
            Option.match({
              onNone: () => Option.some(emptyStream),
              // eslint-disable-next-line functional/prefer-immutable-types
              onSome: (existing: EventStream<V>) => Option.some(existing),
            })
          )
        )
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

export const make = <V>() =>
  pipe(
    emptyStream<{ readonly streamId: EventStreamId; readonly event: V }>(),
    Effect.flatMap(
      // eslint-disable-next-line functional/prefer-immutable-types
      (allEventsStream: EventStream<{ readonly streamId: EventStreamId; readonly event: V }>) =>
        SynchronizedRef.make<Value<V>>({
          eventStreamsById: HashMap.empty<EventStreamId, EventStream<V>>(),
          allEventsStream,
        })
    ),
    Effect.map(
      // eslint-disable-next-line functional/prefer-immutable-types
      (value: SynchronizedRef.SynchronizedRef<Value<V>>): InMemoryStore<V> => ({
        append: (streamEnd) => (newEvents) =>
          pipe(
            value,
            SynchronizedRef.updateEffect(appendToEventStream(streamEnd, newEvents)),
            Effect.map(() => ({
              ...streamEnd,
              eventNumber: streamEnd.eventNumber + newEvents.length,
            }))
          ),

        get: (streamId: EventStreamId) =>
          pipe(
            value,
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
                  // eslint-disable-next-line functional/prefer-immutable-types
                  onSome: (eventStream: EventStream<V>) =>
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
          ),

        getHistorical: (streamId: EventStreamId) =>
          pipe(
            value,
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
                  // eslint-disable-next-line functional/prefer-immutable-types
                  onSome: (eventStream: EventStream<V>) =>
                    Effect.succeed(pipe(eventStream.events, Stream.fromChunk)),
                })
              )
            )
          ),

        getAll: () =>
          pipe(
            value,
            SynchronizedRef.get,
            Effect.map(({ allEventsStream }) =>
              pipe(
                allEventsStream.events,
                Stream.fromChunk,
                Stream.concat(Stream.fromPubSub(allEventsStream.pubsub))
              )
            )
          ),
      })
    )
  );
