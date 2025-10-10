import {
  Chunk,
  Effect,
  Stream,
  pipe,
  Option,
  Schema,
  PubSub,
  HashMap,
  SynchronizedRef,
  Queue,
} from 'effect';
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

interface FileSystemStoreState<V> {
  readonly pubSubsByStreamId: HashMap.HashMap<EventStreamId, PubSub.PubSub<V>>;
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
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.sync requires a thunk argument, cannot be piped differently
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
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
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

const createPubSubForStream = <V>(): Effect.Effect<PubSub.PubSub<V>, never, never> =>
  PubSub.bounded<V>(256);

const createPubSubWithState = <V>(
  currentState: FileSystemStoreState<V>,
  streamId: EventStreamId
): Effect.Effect<readonly [PubSub.PubSub<V>, FileSystemStoreState<V>], never, never> =>
  pipe(
    createPubSubForStream<V>(),
    Effect.map(
      (pubsub) =>
        [
          pubsub,
          {
            pubSubsByStreamId: HashMap.set(currentState.pubSubsByStreamId, streamId, pubsub),
          },
        ] as const
    )
  );

const getOrCreatePubSub =
  <V>(streamId: EventStreamId) =>
  (
    currentState: FileSystemStoreState<V>
  ): Effect.Effect<readonly [PubSub.PubSub<V>, FileSystemStoreState<V>], never, never> =>
    pipe(
      currentState.pubSubsByStreamId,
      HashMap.get(streamId),
      Option.match({
        onSome: (pubsub) => Effect.succeed([pubsub, currentState] as const),
        onNone: () => createPubSubWithState(currentState, streamId),
      })
    );

const ensurePubSubExists = <V>(
  streamId: EventStreamId,
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
): Effect.Effect<PubSub.PubSub<V>, never, never> =>
  pipe(state, SynchronizedRef.modifyEffect(getOrCreatePubSub(streamId)));

const publishEventsToStream = <V>(
  pubsub: PubSub.PubSub<V>,
  events: Chunk.Chunk<V>
): Effect.Effect<void, never, never> => pipe(pubsub, PubSub.publishAll(events), Effect.asVoid);

const publishAndReturnPosition = <V>(
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>,
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
): Effect.Effect<EventStreamPosition, never, never> => {
  const newPosition = {
    ...streamEnd,
    eventNumber: streamEnd.eventNumber + newEvents.length,
  };
  return pipe(
    ensurePubSubExists(streamEnd.streamId, state),
    Effect.flatMap((pubsub) => publishEventsToStream(pubsub, newEvents)),
    Effect.as(newPosition)
  );
};

const writeAndAppendEvents = <V>(
  streamDir: string,
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>,
  fs: FileSystem.FileSystem,
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
): Effect.Effect<
  EventStreamPosition,
  ConcurrencyConflictError,
  FileSystem.FileSystem | Path.Path
> =>
  pipe(
    validateStreamVersion(streamDir, streamEnd, fs),
    Effect.andThen(writeEventsToFiles(streamDir, streamEnd.eventNumber, newEvents)),
    Effect.andThen(publishAndReturnPosition(streamEnd, newEvents, state))
  );

const appendEventsToStream =
  <V>(
    config: FileSystemStoreConfig,
    state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
  ) =>
  (streamEnd: EventStreamPosition) =>
  (
    newEvents: Chunk.Chunk<V>
  ): Effect.Effect<
    EventStreamPosition,
    ConcurrencyConflictError,
    FileSystem.FileSystem | Path.Path
  > => {
    const services = Effect.all([FileSystem.FileSystem, Path.Path] as const);
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
    return pipe(
      services,
      Effect.flatMap(([fs, path]) => {
        const streamDir = getStreamDirectoryPath(config.baseDir, streamEnd.streamId, path);
        return writeAndAppendEvents(streamDir, streamEnd, newEvents, fs, state);
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
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
  return pipe(
    services,
    Effect.flatMap(([fs, path]) => readEventsFromDirectoryWithServices<V>(streamDir, fs, path))
  );
};

const concatHistoricalWithQueue =
  <V>(historical: Stream.Stream<V, never, never>) =>
  (dequeue: Queue.Dequeue<V>): Stream.Stream<V, never, never> =>
    pipe(historical, Stream.concat(Stream.fromQueue(dequeue)));

const createLiveStreamFromHistoricalAndPubSub =
  <V>(historical: Stream.Stream<V, never, never>) =>
  (pubsub: PubSub.PubSub<V>): Stream.Stream<V, never, never> => {
    const subscription = PubSub.subscribe(pubsub);
    const subscriptionEffect = pipe(
      // eslint-disable-next-line effect/no-intermediate-effect-variables -- PubSub.subscribe requires pubsub argument, cannot be piped differently
      subscription,
      Effect.map(concatHistoricalWithQueue(historical))
    );
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Stream.unwrapScoped requires Effect argument, cannot be piped differently
    return Stream.unwrapScoped(subscriptionEffect);
  };

const combineHistoricalWithPubSub = <V>(
  streamId: EventStreamId,
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>,
  historical: Stream.Stream<V, never, never>
): Effect.Effect<Stream.Stream<V, never, never>, never, never> => {
  const pubsubEffect = ensurePubSubExists(streamId, state);
  return pipe(
    pubsubEffect,
    Effect.map(createLiveStreamFromHistoricalAndPubSub(historical)),
    Effect.flatMap(Effect.succeed)
  );
};

const getEventsForStream =
  <V>(
    config: FileSystemStoreConfig,
    state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
  ) =>
  (
    streamId: EventStreamId
  ): Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path> =>
    pipe(
      Path.Path,
      Effect.map((path) => getStreamDirectoryPath(config.baseDir, streamId, path)),
      Effect.flatMap(readEventsFromDirectory<V>),
      Effect.flatMap((historical) => combineHistoricalWithPubSub(streamId, state, historical))
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
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
  return pipe(
    allServices,
    Effect.flatMap(([streamIds, fs, path]) =>
      getAllEventsFromAllStreamsWithServices<V>(config, streamIds, fs, path)
    )
  );
};

const getHistoricalEventsForStream =
  <V>(config: FileSystemStoreConfig) =>
  (
    streamId: EventStreamId
  ): Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path> =>
    pipe(
      Path.Path,
      Effect.map((path) => getStreamDirectoryPath(config.baseDir, streamId, path)),
      Effect.flatMap(readEventsFromDirectory<V>)
    );

const createInitialState = <V>(): FileSystemStoreState<V> => ({
  pubSubsByStreamId: HashMap.empty(),
});

const createStoreFromState =
  <V>(config: FileSystemStoreConfig) =>
  (state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>): FileSystemStore<V> => ({
    append: appendEventsToStream(config, state),
    get: getEventsForStream(config, state),
    getHistorical: getHistoricalEventsForStream(config),
    getAll: () => getAllEventsFromAllStreams(config),
  });

export const make = <V>(
  config: FileSystemStoreConfig
): Effect.Effect<FileSystemStore<V>, never, never> =>
  pipe(
    createInitialState<V>(),
    SynchronizedRef.make<FileSystemStoreState<V>>,
    Effect.map(createStoreFromState(config))
  );
