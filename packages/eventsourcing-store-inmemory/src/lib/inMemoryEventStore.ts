import { Chunk, Effect, Scope, Sink, Stream, pipe } from 'effect';
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

const dropEventsFromStream = <T>(stream: Readonly<Stream.Stream<T, never, never>>, count: number) =>
  pipe(stream, Stream.drop(count));

const readHistoricalEvents = <T>(store: InMemoryStore<T>, from: EventStreamPosition) =>
  pipe(
    from.streamId,
    store.getHistorical,
    Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
      dropEventsFromStream(stream, from.eventNumber)
    )
  );

const readAllEvents = <T>(store: InMemoryStore<T>, from: EventStreamPosition) =>
  pipe(
    from.streamId,
    store.get,
    Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
      dropEventsFromStream(stream, from.eventNumber)
    )
  );

const subscribeToStreamWithError = <T>(
  store: InMemoryStore<T>,
  streamId: EventStreamPosition['streamId']
) =>
  pipe(
    streamId,
    store.get,
    Effect.mapError((error) =>
      eventStoreError.subscribe(streamId, `Failed to subscribe to stream: ${String(error)}`, error)
    )
  );

const appendChunkToStore =
  <T>(store: InMemoryStore<T>) =>
  (end: EventStreamPosition, chunk: Chunk.Chunk<T>) =>
    pipe(chunk, store.append(end));

export const makeInMemoryEventStore = <T>(
  store: InMemoryStore<T>
): Effect.Effect<EventStore<T>, never, never> =>
  Effect.succeed({
    append: (to: EventStreamPosition) =>
      Sink.foldChunksEffect(to, () => true, appendChunkToStore(store)),
    read: (from: EventStreamPosition) => readHistoricalEvents(store, from),
    subscribe: (from: EventStreamPosition) => readAllEvents(store, from),
  });

const addSubscribeMethod = <T>(
  baseStore: EventStore<T>,
  store: InMemoryStore<T>
): SubscribableEventStore<T> => ({
  ...baseStore,
  subscribeToStream: (streamId: EventStreamPosition['streamId']) =>
    subscribeToStreamWithError(store, streamId),
});

export const makeSubscribableInMemoryEventStore = <T>(
  store: InMemoryStore<T>
): Effect.Effect<SubscribableEventStore<T>, never, never> =>
  pipe(
    store,
    makeInMemoryEventStore,
    Effect.map((baseStore) => addSubscribeMethod(baseStore, store))
  );
