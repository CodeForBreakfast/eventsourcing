import { Effect, Scope, Sink, Stream, pipe } from 'effect';
import {
  EventStreamPosition,
  EventStore,
  eventStoreError,
  EventStoreError,
} from '@codeforbreakfast/eventsourcing-store';
import { type InMemoryStore } from './InMemoryStore';

export interface SubscribableEventStore<T> extends EventStore<T> {
  readonly subscribeToStream: (
    streamId: EventStreamPosition['streamId']
  ) => Effect.Effect<Stream.Stream<T, never>, EventStoreError, Scope.Scope>;
}

const dropEventsFromStream =
  <T>(count: number) =>
  (stream: Readonly<Stream.Stream<T, never, never>>) =>
    Stream.drop(stream, count);

const readHistoricalEvents =
  <T>(store: InMemoryStore<T>) =>
  (from: EventStreamPosition) =>
    pipe(from.streamId, store.getHistorical, Effect.map(dropEventsFromStream<T>(from.eventNumber)));

const readAllEvents =
  <T>(store: InMemoryStore<T>) =>
  (from: EventStreamPosition) =>
    pipe(from.streamId, store.get, Effect.map(dropEventsFromStream<T>(from.eventNumber)));

const createSubscribeError = (streamId: EventStreamPosition['streamId']) =>
  eventStoreError.subscribe(streamId, `Failed to subscribe to stream: ${String(streamId)}`);

const subscribeToStreamWithError =
  <T>(streamId: EventStreamPosition['streamId']) =>
  (store: InMemoryStore<T>) =>
    pipe(streamId, store.get, Effect.mapError(createSubscribeError(streamId)));

const subscribeToAllStreams = <T>(store: InMemoryStore<T>) =>
  pipe(
    store.getAllLiveOnly(),
    Effect.map((stream) =>
      Stream.map(stream, ({ streamId, eventNumber, event }) => ({
        position: { streamId, eventNumber },
        event,
      }))
    )
  );

export const makeInMemoryEventStore = <T>(
  store: InMemoryStore<T>
): Effect.Effect<EventStore<T>, never, never> =>
  Effect.succeed({
    append: (to: EventStreamPosition) =>
      Sink.foldChunksEffect(
        to,
        () => true,
        (end, chunk) => pipe(chunk, store.append(end))
      ),
    read: readHistoricalEvents(store),
    subscribe: readAllEvents(store),
    subscribeAll: () => subscribeToAllStreams(store),
  });

const addSubscribeMethod =
  <T>(store: InMemoryStore<T>) =>
  (baseStore: EventStore<T>): SubscribableEventStore<T> => ({
    ...baseStore,
    subscribeToStream: (streamId: EventStreamPosition['streamId']) =>
      pipe(store, subscribeToStreamWithError(streamId)),
  });

export const makeSubscribableInMemoryEventStore = <T>(
  store: InMemoryStore<T>
): Effect.Effect<SubscribableEventStore<T>, never, never> =>
  pipe(store, makeInMemoryEventStore, Effect.map(addSubscribeMethod(store)));
