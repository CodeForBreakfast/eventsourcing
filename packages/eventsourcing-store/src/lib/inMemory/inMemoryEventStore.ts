import { Chunk, Effect, Scope, Sink, Stream, pipe } from 'effect';
import { EventStreamPosition } from '../streamTypes';
import type { ReadParams } from '../services';
import { type EventStore } from '../eventstore';
import { eventStoreError, EventStoreError } from '../errors';
import * as InMemoryStore from './InMemoryStore';

// Helper to determine if parameter is ReadParams or EventStreamPosition
const isEventStreamPosition = (
  params: ReadParams | EventStreamPosition,
): params is EventStreamPosition => 'eventNumber' in params;

// Helper to apply read options to a stream
const applyReadOptions = <T>(
  stream: Readonly<Stream.Stream<T, never, never>>,
  options: Readonly<ReadParams>,
): Stream.Stream<T, never, never> =>
  pipe(
    stream,
    // Apply fromEventNumber filter
    options.fromEventNumber !== undefined
      ? Stream.drop(options.fromEventNumber)
      : (s) => s,
    // Apply toEventNumber filter
    options.toEventNumber !== undefined
      ? Stream.take(options.toEventNumber - (options.fromEventNumber ?? 0) + 1)
      : (s) => s,
    // Apply direction - if backward, collect all and reverse
    options.direction === 'backward'
      ? (s) =>
          pipe(
            s,
            Stream.runCollect,
            Effect.map((chunk) => Stream.fromIterable(Chunk.reverse(chunk))),
            Stream.unwrap,
          )
      : (s) => s,
    // Apply batch size if specified
    options.batchSize
      ? (s) =>
          pipe(
            s,
            Stream.grouped(options.batchSize!),
            Stream.flatMap((chunk) => Stream.fromIterable(chunk)),
          )
      : (s) => s,
  );

export interface EnhancedEventStore<T> extends EventStore<T> {
  readonly subscribeToStream: (
    streamId: EventStreamPosition['streamId'],
  ) => Effect.Effect<Stream.Stream<T, never>, EventStoreError, Scope.Scope>;
}

export const inMemoryEventStore = <T>(
  store: Readonly<InMemoryStore.InMemoryStore<T>>,
) =>
  Effect.succeed({
    write: (to: EventStreamPosition) =>
      Sink.foldChunksEffect(
        to,
        () => true,
        (end, chunk: Chunk.Chunk<T>) => pipe(chunk, store.append(end)),
      ),
    read: (params: ReadParams | EventStreamPosition) => {
      if (isEventStreamPosition(params)) {
        // Legacy EventStreamPosition behavior
        return pipe(
          params.streamId,
          store.get,
          Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
            pipe(stream, Stream.drop(params.eventNumber)),
          ),
        );
      }
      // New ReadParams behavior with options
      return pipe(
        params.streamId,
        store.getHistorical,
        Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
          applyReadOptions(stream, params),
        ),
      );
    },
    readHistorical: (params: ReadParams | EventStreamPosition) => {
      if (isEventStreamPosition(params)) {
        // Legacy EventStreamPosition behavior
        return pipe(
          params.streamId,
          store.getHistorical,
          Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
            pipe(stream, Stream.drop(params.eventNumber)),
          ),
        );
      }
      // New ReadParams behavior with options
      return pipe(
        params.streamId,
        store.getHistorical,
        Effect.map((stream: Readonly<Stream.Stream<T, never, never>>) =>
          applyReadOptions(stream, params),
        ),
      );
    },
  });

export const enhancedInMemoryEventStore = <T>(
  store: Readonly<InMemoryStore.InMemoryStore<T>>,
) =>
  pipe(
    inMemoryEventStore(store),
    Effect.map((baseStore) => ({
      ...baseStore,
      subscribeToStream: (streamId: EventStreamPosition['streamId']) =>
        pipe(
          store.get(streamId),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to subscribe to stream: ${String(error)}`,
              error,
            ),
          ),
        ),
    })),
  );
