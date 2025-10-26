import { Chunk, Effect, Sink, Stream, pipe } from 'effect';
import { EventStreamPosition, EventStore } from '@codeforbreakfast/eventsourcing-store';
import { FileSystem, Path } from '@effect/platform';
import { type FileSystemStore } from './FileSystemStore';

const dropEventsFromStream =
  <T>(count: number) =>
  (stream: Readonly<Stream.Stream<T, never, never>>) =>
    Stream.drop(stream, count);

const readHistoricalEvents =
  <T>(store: FileSystemStore<T>, fs: FileSystem.FileSystem, path: Path.Path) =>
  (from: EventStreamPosition) =>
    pipe(
      from.streamId,
      store.getHistorical,
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.map(dropEventsFromStream<T>(from.eventNumber))
    );

const readAllEvents =
  <T>(store: FileSystemStore<T>, fs: FileSystem.FileSystem, path: Path.Path) =>
  (from: EventStreamPosition) =>
    pipe(
      from.streamId,
      store.get,
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.map(dropEventsFromStream<T>(from.eventNumber))
    );

const createAppendSink =
  <T>(store: FileSystemStore<T>, fs: FileSystem.FileSystem, path: Path.Path) =>
  (to: EventStreamPosition) =>
    Sink.foldChunksEffect(
      to,
      () => true,
      (end, chunk: Chunk.Chunk<T>) =>
        pipe(
          chunk,
          store.append(end),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        )
    );

const subscribeToAllStreams = <T>(store: FileSystemStore<T>) => store.getAllLiveOnly();

const createEventStoreWithServices =
  <T>(store: FileSystemStore<T>) =>
  ([fs, path]: readonly [FileSystem.FileSystem, Path.Path]): EventStore<T> => ({
    append: createAppendSink(store, fs, path),
    read: readHistoricalEvents(store, fs, path),
    subscribe: readAllEvents(store, fs, path),
    subscribeAll: () => subscribeToAllStreams(store),
  });

export const makeFileSystemEventStore = <T>(
  store: FileSystemStore<T>
): Effect.Effect<EventStore<T>, never, FileSystem.FileSystem | Path.Path> =>
  pipe(
    // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all with tuple requires function call for proper type inference
    Effect.all([FileSystem.FileSystem, Path.Path]),
    Effect.map(createEventStoreWithServices(store))
  );
