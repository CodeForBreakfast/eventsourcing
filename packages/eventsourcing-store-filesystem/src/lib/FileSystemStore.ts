import { Chunk, Effect, Stream, pipe, Option, Schema } from 'effect';
import { FileSystem, Path } from '@effect/platform';
import {
  EventStreamId,
  EventStreamPosition,
  ConcurrencyConflictError,
} from '@codeforbreakfast/eventsourcing-store';

export interface FileSystemStoreConfig {
  readonly baseDir: string;
}

export interface FileSystemStore<V = never> {
  readonly append: (
    to: EventStreamPosition
  ) => (
    events: Chunk.Chunk<V>
  ) => Effect.Effect<
    EventStreamPosition,
    ConcurrencyConflictError,
    FileSystem.FileSystem | Path.Path
  >;
  readonly get: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path>;
  readonly getHistorical: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path>;
  readonly getAll: () => Effect.Effect<
    Stream.Stream<{ readonly streamId: EventStreamId; readonly event: V }, never, never>,
    never,
    FileSystem.FileSystem | Path.Path
  >;
}

const getStreamDirectoryPath = (
  baseDir: string,
  streamId: EventStreamId,
  path: Path.Path
): string => path.join(baseDir, String(streamId));

const getEventFilePath = (streamDir: string, eventNumber: number, path: Path.Path): string =>
  path.join(streamDir, `${eventNumber}.json`);

const ensureStreamDirectoryExists = (
  streamDir: string,
  fs: FileSystem.FileSystem
): Effect.Effect<void, never, never> =>
  pipe(
    fs.makeDirectory(streamDir, { recursive: true }),
    Effect.catchAll(() => Effect.void)
  );

const countExistingEvents = (
  streamDir: string,
  fs: FileSystem.FileSystem
): Effect.Effect<number, never, never> => {
  const readDir = fs.readDirectory(streamDir);
  return pipe(
    readDir,
    Effect.map((files) => files.filter((file) => file.endsWith('.json')).length),
    Effect.catchAll(() => Effect.succeed(0))
  );
};

const validateStreamPosition = (
  expectedVersion: number,
  actualVersion: number,
  streamId: EventStreamId
): Effect.Effect<void, ConcurrencyConflictError, never> =>
  expectedVersion === actualVersion
    ? Effect.void
    : Effect.fail(
        new ConcurrencyConflictError({
          expectedVersion,
          actualVersion,
          streamId,
        })
      );

const writeFileStringForPath =
  (eventPath: string, fs: FileSystem.FileSystem) =>
  (json: string): Effect.Effect<void, never, never> =>
    pipe(
      fs.writeFileString(eventPath, json),
      Effect.catchAll(() => Effect.void)
    );

const writeEventToFile = <V>(
  eventPath: string,
  event: V,
  fs: FileSystem.FileSystem
): Effect.Effect<void, never, never> => {
  const serialized = Effect.sync(() => JSON.stringify(event, null, 2));
  const writeFile = writeFileStringForPath(eventPath, fs);
  return pipe(serialized, Effect.flatMap(writeFile));
};

const writeEventAtIndex = <V>(
  streamDir: string,
  startIndex: number,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  event: V,
  i: number
): Effect.Effect<void, never, never> => {
  const eventPath = getEventFilePath(streamDir, startIndex + i, path);
  return writeEventToFile(eventPath, event, fs);
};

const writeEventsToFilesWithServices = <V>(
  streamDir: string,
  startIndex: number,
  events: Chunk.Chunk<V>,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<void, never, never> =>
  pipe(
    events,
    Chunk.toReadonlyArray,
    (eventsArray) =>
      Effect.all(
        eventsArray.map((event, i) => writeEventAtIndex(streamDir, startIndex, fs, path, event, i)),
        { concurrency: 'unbounded' }
      ),
    Effect.asVoid
  );

const writeEventsToFiles = <V>(
  streamDir: string,
  startIndex: number,
  events: Chunk.Chunk<V>
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> => {
  const services = Effect.all([FileSystem.FileSystem, Path.Path] as const);
  return pipe(
    services,
    Effect.flatMap(([fs, path]) =>
      writeEventsToFilesWithServices(streamDir, startIndex, events, fs, path)
    )
  );
};

const validateStreamVersion = (
  streamDir: string,
  streamEnd: EventStreamPosition,
  fs: FileSystem.FileSystem
): Effect.Effect<void, ConcurrencyConflictError, never> =>
  pipe(
    ensureStreamDirectoryExists(streamDir, fs),
    Effect.andThen(countExistingEvents(streamDir, fs)),
    Effect.flatMap((actualVersion) =>
      validateStreamPosition(streamEnd.eventNumber, actualVersion, streamEnd.streamId)
    )
  );

const writeAndAppendEvents = <V>(
  streamDir: string,
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>,
  fs: FileSystem.FileSystem
): Effect.Effect<
  EventStreamPosition,
  ConcurrencyConflictError,
  FileSystem.FileSystem | Path.Path
> => {
  const newPosition = {
    ...streamEnd,
    eventNumber: streamEnd.eventNumber + newEvents.length,
  };
  return pipe(
    validateStreamVersion(streamDir, streamEnd, fs),
    Effect.andThen(writeEventsToFiles(streamDir, streamEnd.eventNumber, newEvents)),
    Effect.as(newPosition)
  );
};

const appendEventsToStream =
  <V>(config: FileSystemStoreConfig) =>
  (streamEnd: EventStreamPosition) =>
  (
    newEvents: Chunk.Chunk<V>
  ): Effect.Effect<
    EventStreamPosition,
    ConcurrencyConflictError,
    FileSystem.FileSystem | Path.Path
  > => {
    const services = Effect.all([FileSystem.FileSystem, Path.Path] as const);
    return pipe(
      services,
      Effect.flatMap(([fs, path]) => {
        const streamDir = getStreamDirectoryPath(config.baseDir, streamEnd.streamId, path);
        return writeAndAppendEvents(streamDir, streamEnd, newEvents, fs);
      })
    );
  };

const parseJsonContent = <V>(content: string): Effect.Effect<V, Error, never> =>
  Effect.try({
    try: () => JSON.parse(content) as V,
    catch: () => new Error('Failed to parse event'),
  });

const readEventFromFile = <V>(
  eventPath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<Option.Option<V>, never, never> => {
  const readFile = fs.readFileString(eventPath);
  return pipe(
    readFile,
    Effect.flatMap(parseJsonContent<V>),
    Effect.map(Option.some),
    Effect.catchAll(() => Effect.succeed(Option.none()))
  );
};

const parseEventNumber = (filename: string): Readonly<Option.Option<number>> => {
  const match: readonly string[] | null = filename.match(/^(\d+)\.json$/);
  if (match === null || match[1] === undefined) {
    return Option.none();
  }
  return Option.some(parseInt(match[1], 10));
};

const extractEventNumber = (
  filename: string
): { readonly filename: string; readonly eventNumber: Option.Option<number> } => ({
  filename,
  eventNumber: parseEventNumber(filename),
});

const filterByEventNumber = (item: {
  readonly filename: string;
  readonly eventNumber: Option.Option<number>;
}): item is { readonly filename: string; readonly eventNumber: Option.Option<number> } =>
  Option.isSome(item.eventNumber);

const unwrapEventNumber = (item: {
  readonly filename: string;
  readonly eventNumber: Option.Option<number>;
}): { readonly filename: string; readonly eventNumber: number } => ({
  filename: item.filename,
  eventNumber: Option.getOrThrow(item.eventNumber),
});

const sortByEventNumber = (
  a: { readonly eventNumber: number },
  b: { readonly eventNumber: number }
): number => a.eventNumber - b.eventNumber;

const getFilename = (item: { readonly filename: string }): string => item.filename;

const buildEventPath = (streamDir: string, path: Path.Path, filename: string): string => {
  const basePath = getEventFilePath(streamDir, 0, path);
  return basePath.replace('0.json', filename);
};

const readAndUnwrapEvent = <V>(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  streamDir: string,
  filename: string
): Effect.Effect<V, never, never> =>
  pipe(
    readEventFromFile<V>(buildEventPath(streamDir, path, filename), fs),
    Effect.map(Option.getOrThrow)
  );

const processFilesIntoStream = <V>(
  files: readonly string[],
  streamDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Stream.Stream<V, never, never> => {
  const sortedFilenames = files
    .map(extractEventNumber)
    .filter(filterByEventNumber)
    .map(unwrapEventNumber)
    .sort(sortByEventNumber)
    .map(getFilename);
  return pipe(
    sortedFilenames,
    Stream.fromIterable,
    Stream.mapEffect((filename) => readAndUnwrapEvent(fs, path, streamDir, filename))
  );
};

const readEventsFromDirectoryWithServices = <V>(
  streamDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<Stream.Stream<V, never, never>, never, never> => {
  const directoryFiles = fs.readDirectory(streamDir);
  return pipe(
    directoryFiles,
    Effect.map((files) => processFilesIntoStream<V>(files, streamDir, fs, path)),
    Effect.catchAll(() => Effect.succeed(Stream.empty))
  );
};

const readEventsFromDirectory = <V>(
  streamDir: string
): Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path> => {
  const services = Effect.all([FileSystem.FileSystem, Path.Path] as const);
  return pipe(
    services,
    Effect.flatMap(([fs, path]) => readEventsFromDirectoryWithServices<V>(streamDir, fs, path))
  );
};

const getEventsForStream =
  <V>(config: FileSystemStoreConfig) =>
  (
    streamId: EventStreamId
  ): Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path> =>
    pipe(
      Path.Path,
      Effect.map((path) => getStreamDirectoryPath(config.baseDir, streamId, path)),
      Effect.flatMap(readEventsFromDirectory<V>)
    );

const EventStreamIdSchema = pipe(Schema.String, Schema.brand('EventStreamId'));

const decodeEventStreamId = Schema.decode(EventStreamIdSchema);

// eslint-disable-next-line effect/no-eta-expansion -- Schema.decode returns a function with optional ParseOptions parameter that conflicts with Array.map's index parameter
const decodeStreamId = (dir: string) => decodeEventStreamId(dir);

const getAllStreamsWithFs =
  (config: FileSystemStoreConfig) =>
  (fs: FileSystem.FileSystem): Effect.Effect<readonly EventStreamId[], never, never> => {
    const baseDirectory = fs.readDirectory(config.baseDir);
    return pipe(
      baseDirectory,
      Effect.flatMap((dirs) => Effect.all(dirs.map(decodeStreamId))),
      Effect.catchAll(() => Effect.succeed([]))
    );
  };

const getAllStreams = (
  config: FileSystemStoreConfig
): Effect.Effect<readonly EventStreamId[], never, FileSystem.FileSystem> =>
  pipe(FileSystem.FileSystem, Effect.flatMap(getAllStreamsWithFs(config)));

const wrapEventWithStreamId =
  (streamId: EventStreamId) =>
  <V>(event: V): { readonly streamId: EventStreamId; readonly event: V } => ({
    streamId,
    event,
  });

const getStreamEventsWithServices = <V>(config: FileSystemStoreConfig, streamId: EventStreamId) =>
  pipe(
    Path.Path,
    Effect.map((path) => getStreamDirectoryPath(config.baseDir, streamId, path)),
    Effect.flatMap(readEventsFromDirectory<V>)
  );

const collectStreamEventsWithServices = <V>(
  config: FileSystemStoreConfig,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  streamId: EventStreamId
): Effect.Effect<
  Chunk.Chunk<{ readonly streamId: EventStreamId; readonly event: V }>,
  never,
  never
> => {
  const streamEvents = getStreamEventsWithServices<V>(config, streamId);
  return pipe(
    streamEvents,
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.flatMap(Stream.runCollect),
    Effect.map(Chunk.map(wrapEventWithStreamId(streamId)))
  );
};

const flattenChunks = <T>(chunks: readonly Chunk.Chunk<T>[]): Chunk.Chunk<T> =>
  pipe(chunks, Chunk.fromIterable, Chunk.flatten);

const getAllEventsFromAllStreamsWithServices = <V>(
  config: FileSystemStoreConfig,
  streamIds: readonly EventStreamId[],
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<
  Stream.Stream<{ readonly streamId: EventStreamId; readonly event: V }, never, never>,
  never,
  never
> =>
  pipe(
    streamIds,
    Effect.forEach((streamId) => collectStreamEventsWithServices<V>(config, fs, path, streamId)),
    Effect.map(flattenChunks),
    Effect.map(Stream.fromChunk)
  );

const getAllEventsFromAllStreams = <V>(
  config: FileSystemStoreConfig
): Effect.Effect<
  Stream.Stream<{ readonly streamId: EventStreamId; readonly event: V }, never, never>,
  never,
  FileSystem.FileSystem | Path.Path
> => {
  const allServices = Effect.all([
    getAllStreams(config),
    FileSystem.FileSystem,
    Path.Path,
  ] as const);
  return pipe(
    allServices,
    Effect.flatMap(([streamIds, fs, path]) =>
      getAllEventsFromAllStreamsWithServices<V>(config, streamIds, fs, path)
    )
  );
};

export const make = <V>(
  config: FileSystemStoreConfig
): Effect.Effect<FileSystemStore<V>, never, never> =>
  Effect.succeed({
    append: appendEventsToStream(config),
    get: getEventsForStream(config),
    getHistorical: getEventsForStream(config),
    getAll: () => getAllEventsFromAllStreams(config),
  });
