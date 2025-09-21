import { Chunk, Effect, Scope, Sink, Stream, pipe } from 'effect';
import { EventStreamPosition } from '../streamTypes';
import type { EventStore } from '../services';
import { eventStoreError, EventStoreError } from '../errors';
import * as InMemoryStore from './InMemoryStore';

export interface SubscribableEventStore<T> extends EventStore<T> {
  readonly subscribeToStream: (
    streamId: EventStreamPosition['streamId']
  ) => Effect.Effect<Stream.Stream<T, never>, EventStoreError, Scope.Scope>;
}

export const makeInMemoryEventStore = <T>(
  store: Readonly<InMemoryStore.InMemoryStore<T>>
): Effect.Effect<EventStore<T>, never, never> =>
  Effect.succeed({
    append: (to: EventStreamPosition) =>
      Sink.foldChunksEffect(
        to,
        () => true,
        (end, chunk: Chunk.Chunk<T>) => pipe(chunk, store.append(end))
      ),
    read: (from: EventStreamPosition) =>
      // Read returns only historical events, no live updates
      pipe(
        from.streamId,
        store.getHistorical,
        Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
          pipe(stream, Stream.drop(from.eventNumber))
        )
      ),
    subscribe: (from: EventStreamPosition) =>
      // Subscribe returns historical events + live updates
      pipe(
        from.streamId,
        store.get, // Use get() which returns both historical and live events
        Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
          pipe(stream, Stream.drop(from.eventNumber))
        )
      ),
  });

export const makeSubscribableInMemoryEventStore = <T>(
  store: Readonly<InMemoryStore.InMemoryStore<T>>
): Effect.Effect<SubscribableEventStore<T>, never, never> =>
  pipe(
    makeInMemoryEventStore(store),
    Effect.map((baseStore) => ({
      ...baseStore,
      subscribeToStream: (streamId: EventStreamPosition['streamId']) =>
        pipe(
          store.get(streamId),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to subscribe to stream: ${String(error)}`,
              error
            )
          )
        ),
    }))
  );
