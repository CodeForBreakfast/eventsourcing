import {
  Cause,
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
  type StreamEvent,
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
    Stream.Stream<StreamEvent<V>, never, never>,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  readonly getAllLiveOnly: () => Effect.Effect<
    Stream.Stream<StreamEvent<V>, never, never>,
    never,
    never
  >;
}

/**
 * How many of the most recent all-events publishes the store keeps, so that an all-events
 * stream started after its subscribe call still receives what was published in between.
 */
const RECENT_ALL_EVENTS_LIMIT = 1024;

/**
 * The all-events feed, with a count of everything published to it and the most recent events
 */
interface AllEventsFeed<V> {
  readonly pubsub: PubSub.PubSub<StreamEvent<V>>;
  readonly published: number;
  readonly recent: Chunk.Chunk<StreamEvent<V>>;
}

interface FileSystemStoreState<V> {
  readonly pubSubsByStreamId: HashMap.HashMap<EventStreamId, PubSub.PubSub<V>>;
  readonly allEvents: AllEventsFeed<V>;
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
  Effect.if(expectedVersion === actualVersion, {
    onTrue: () => Effect.void,
    onFalse: () =>
      Effect.fail(
        new ConcurrencyConflictError({
          expectedVersion,
          actualVersion,
          streamId,
        })
      ),
  });

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
            ...currentState,
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

const publishEventsToStream = <V>(
  pubsub: PubSub.PubSub<V>,
  events: Chunk.Chunk<V>
): Effect.Effect<void, never, never> => pipe(pubsub, PubSub.publishAll(events), Effect.asVoid);

const tagEventsWithStreamId = <V>(
  newEvents: Chunk.Chunk<V>,
  streamId: EventStreamId,
  startingEventNumber: number
) =>
  pipe(
    newEvents,
    Chunk.map((event, index) => ({
      position: { streamId, eventNumber: startingEventNumber + index },
      event,
    }))
  );

const recordPublished = <V>(
  feed: AllEventsFeed<V>,
  events: Chunk.Chunk<StreamEvent<V>>
): AllEventsFeed<V> => ({
  ...feed,
  published: feed.published + Chunk.size(events),
  recent: pipe(feed.recent, Chunk.appendAll(events), Chunk.takeRight(RECENT_ALL_EVENTS_LIMIT)),
});

const publishToAllEvents = <V>(
  current: FileSystemStoreState<V>,
  events: Chunk.Chunk<StreamEvent<V>>
): Effect.Effect<FileSystemStoreState<V>, never, never> =>
  Effect.as(publishEventsToStream(current.allEvents.pubsub, events), {
    ...current,
    allEvents: recordPublished(current.allEvents, events),
  });

const publishToStreamThenAllEvents =
  <V>(streamEnd: EventStreamPosition, newEvents: Chunk.Chunk<V>) =>
  ([pubsub, withPubSub]: readonly [PubSub.PubSub<V>, FileSystemStoreState<V>]) =>
    Effect.andThen(
      publishEventsToStream(pubsub, newEvents),
      publishToAllEvents(
        withPubSub,
        tagEventsWithStreamId(newEvents, streamEnd.streamId, streamEnd.eventNumber)
      )
    );

const publishEventsToStreams = <V>(
  streamEnd: EventStreamPosition,
  newEvents: Chunk.Chunk<V>,
  current: FileSystemStoreState<V>
): Effect.Effect<FileSystemStoreState<V>, never, never> =>
  pipe(
    current,
    getOrCreatePubSub<V>(streamEnd.streamId),
    Effect.flatMap(publishToStreamThenAllEvents(streamEnd, newEvents))
  );

const writeAndPublishEvents =
  <V>(
    streamDir: string,
    streamEnd: EventStreamPosition,
    newEvents: Chunk.Chunk<V>,
    fs: FileSystem.FileSystem
  ) =>
  (
    current: FileSystemStoreState<V>
  ): Effect.Effect<
    readonly [EventStreamPosition, FileSystemStoreState<V>],
    ConcurrencyConflictError,
    FileSystem.FileSystem | Path.Path
  > =>
    pipe(
      validateStreamVersion(streamDir, streamEnd, fs),
      Effect.andThen(writeEventsToFiles(streamDir, streamEnd.eventNumber, newEvents)),
      Effect.andThen(publishEventsToStreams(streamEnd, newEvents, current)),
      Effect.map(
        (next) =>
          [{ ...streamEnd, eventNumber: streamEnd.eventNumber + newEvents.length }, next] as const
      )
    );

// A subscription lists a stream's history and subscribes to its live events under this lock, so
// an append that writes and publishes under the same lock reaches it exactly once.
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
    state,
    SynchronizedRef.modifyEffect(writeAndPublishEvents(streamDir, streamEnd, newEvents, fs))
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
    return pipe(
      services,
      Effect.flatMap(([fs, path]) => {
        const streamDir = getStreamDirectoryPath(config.baseDir, streamEnd.streamId, path);
        return writeAndAppendEvents(streamDir, streamEnd, newEvents, fs, state);
      })
    );
  };

const parseJsonContent = <V>(content: string): Effect.Effect<V, Cause.UnknownException, never> =>
  Effect.try(() => JSON.parse(content) as V);

const readEventFromFile = <V>(
  eventPath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<Option.Option<V>, never, never> => {
  const readFile = fs.readFileString(eventPath);
  return pipe(
    readFile,
    Effect.flatMap(parseJsonContent<V>),
    Effect.asSome,
    Effect.catchAll(() => Effect.succeedNone)
  );
};

const parseEventNumber = (filename: string): Readonly<Option.Option<number>> => {
  const match: readonly string[] | null = filename.match(/^(\d+)\.json$/);
  return pipe(
    match,
    Option.fromNullable,
    Option.flatMap((m) => Option.fromNullable(m[1])),
    Option.map((numStr) => parseInt(numStr, 10))
  );
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

const concatHistoricalWithQueue =
  <V>(historical: Stream.Stream<V, never, never>) =>
  (dequeue: Queue.Dequeue<V>): Stream.Stream<V, never, never> =>
    pipe(historical, Stream.concat(Stream.fromQueue(dequeue)));

const subscribeWithHistory = <V>(
  pubsub: PubSub.PubSub<V>,
  streamDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
) =>
  pipe(
    readEventsFromDirectoryWithServices<V>(streamDir, fs, path),
    Effect.flatMap((historical) =>
      Effect.map(PubSub.subscribe(pubsub), concatHistoricalWithQueue(historical))
    )
  );

const subscribeAfterListingHistory =
  <V>(streamId: EventStreamId, streamDir: string, fs: FileSystem.FileSystem, path: Path.Path) =>
  (current: FileSystemStoreState<V>) =>
    pipe(
      current,
      getOrCreatePubSub<V>(streamId),
      Effect.flatMap(([pubsub, next]) =>
        Effect.map(
          subscribeWithHistory(pubsub, streamDir, fs, path),
          (stream) => [stream, next] as const
        )
      )
    );

// Doing this when the stream runs, not when subscribe returns, catches events appended in the
// meantime without holding a subscription for a stream that is never run.
const liveStreamWithHistory = <V>(
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>,
  streamId: EventStreamId,
  streamDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
): Stream.Stream<V, never, never> =>
  Stream.unwrapScoped(
    SynchronizedRef.modifyEffect(
      state,
      subscribeAfterListingHistory<V>(streamId, streamDir, fs, path)
    )
  );

const getEventsForStream =
  <V>(
    config: FileSystemStoreConfig,
    state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
  ) =>
  (
    streamId: EventStreamId
  ): Effect.Effect<Stream.Stream<V, never, never>, never, FileSystem.FileSystem | Path.Path> => {
    const services = Effect.all([FileSystem.FileSystem, Path.Path] as const);
    return pipe(
      // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
      services,
      Effect.map(([fs, path]) =>
        liveStreamWithHistory(
          state,
          streamId,
          getStreamDirectoryPath(config.baseDir, streamId, path),
          fs,
          path
        )
      )
    );
  };

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

const getStreamEventsWithServices = <V>(config: FileSystemStoreConfig, streamId: EventStreamId) =>
  pipe(
    Path.Path,
    Effect.map((path) => getStreamDirectoryPath(config.baseDir, streamId, path)),
    Effect.flatMap(readEventsFromDirectory<V>)
  );

const wrapEventsWithStreamId = <V>(streamId: EventStreamId) =>
  Chunk.map((event: V, index: number) => ({
    position: { streamId, eventNumber: index },
    event,
  }));

const collectStreamEventsWithServices = <V>(
  config: FileSystemStoreConfig,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  streamId: EventStreamId
): Effect.Effect<
  Chunk.Chunk<{
    readonly position: EventStreamPosition;
    readonly event: V;
  }>,
  never,
  never
> => {
  const streamEvents = getStreamEventsWithServices<V>(config, streamId);
  return pipe(
    streamEvents,
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.flatMap(Stream.runCollect),
    Effect.map(wrapEventsWithStreamId(streamId))
  );
};

const flattenChunks = <T>(chunks: readonly Chunk.Chunk<T>[]): Chunk.Chunk<T> =>
  pipe(chunks, Chunk.fromIterable, Chunk.flatten);

const getAllEventsFromAllStreamsWithServices = <V>(
  config: FileSystemStoreConfig,
  streamIds: readonly EventStreamId[],
  fs: FileSystem.FileSystem,
  path: Path.Path
): Effect.Effect<Stream.Stream<StreamEvent<V>, never, never>, never, never> =>
  pipe(
    streamIds,
    Effect.forEach((streamId) => collectStreamEventsWithServices<V>(config, fs, path, streamId)),
    Effect.map(flattenChunks),
    Effect.map(Stream.fromChunk)
  );

const getAllEventsFromAllStreams = <V>(
  config: FileSystemStoreConfig
): Effect.Effect<
  Stream.Stream<StreamEvent<V>, never, never>,
  never,
  FileSystem.FileSystem | Path.Path
> => {
  const allServices = Effect.all([
    getAllStreams(config),
    FileSystem.FileSystem,
    Path.Path,
  ] as const);
  return pipe(
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Effect.all requires an object argument, cannot be piped differently
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

const createBoundedPubSub = <V>() => PubSub.bounded<V>(256);

const createAllEventsFeed = <V>(): Effect.Effect<AllEventsFeed<V>, never, never> =>
  pipe(
    createBoundedPubSub<StreamEvent<V>>(),
    Effect.map((pubsub) => ({ pubsub, published: 0, recent: Chunk.empty<StreamEvent<V>>() }))
  );

const createInitialStateWithAllEventsFeed = <V>(
  allEvents: AllEventsFeed<V>
): FileSystemStoreState<V> => ({
  pubSubsByStreamId: HashMap.empty(),
  allEvents,
});

const warnOfMissedAllEvents = (lost: number) =>
  Effect.logWarning(
    'An all-events subscription started too late to receive every event published since it was made',
    { lost }
  );

const eventsPublishedSince = <V>(
  feed: AllEventsFeed<V>,
  publishedAtSubscribe: number
): Effect.Effect<Chunk.Chunk<StreamEvent<V>>, never, never> => {
  const missed = feed.published - publishedAtSubscribe;
  const lost = missed - Chunk.size(feed.recent);
  return Effect.as(
    Effect.when(warnOfMissedAllEvents(lost), () => lost > 0),
    Chunk.takeRight(feed.recent, missed)
  );
};

const replayThenLive =
  <V>(live: Queue.Dequeue<StreamEvent<V>>) =>
  (missed: Chunk.Chunk<StreamEvent<V>>): Stream.Stream<StreamEvent<V>, never, never> =>
    pipe(missed, Stream.fromChunk, Stream.concat(Stream.fromQueue(live)));

const replayMissedThenLive =
  <V>(feed: AllEventsFeed<V>, publishedAtSubscribe: number) =>
  (live: Queue.Dequeue<StreamEvent<V>>) =>
    Effect.map(eventsPublishedSince(feed, publishedAtSubscribe), replayThenLive(live));

const subscribeAndReplayMissed =
  (publishedAtSubscribe: number) =>
  <V>(current: FileSystemStoreState<V>) =>
    pipe(
      current.allEvents.pubsub,
      PubSub.subscribe,
      Effect.flatMap(replayMissedThenLive(current.allEvents, publishedAtSubscribe)),
      Effect.map((stream) => [stream, current] as const)
    );

// Appending publishes to all-events under this lock, so replaying what was published since the
// subscribe call and subscribing under the same lock leaves no gap between them.
const liveAllEventsSince = <V>(
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>,
  publishedAtSubscribe: number
): Stream.Stream<StreamEvent<V>, never, never> =>
  Stream.unwrapScoped(
    SynchronizedRef.modifyEffect(state, subscribeAndReplayMissed(publishedAtSubscribe))
  );

const getAllEventsLiveOnlyStream = <V>(
  state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>
): Effect.Effect<Stream.Stream<StreamEvent<V>, never, never>, never, never> =>
  pipe(
    state,
    SynchronizedRef.get,
    Effect.map(({ allEvents }) => liveAllEventsSince(state, allEvents.published))
  );

const createStoreFromState =
  <V>(config: FileSystemStoreConfig) =>
  (state: SynchronizedRef.SynchronizedRef<FileSystemStoreState<V>>): FileSystemStore<V> => ({
    append: appendEventsToStream(config, state),
    get: getEventsForStream(config, state),
    getHistorical: getHistoricalEventsForStream(config),
    getAll: () => getAllEventsFromAllStreams(config),
    getAllLiveOnly: () => getAllEventsLiveOnlyStream(state),
  });

const createStoreWithAllEventsFeed =
  <V>(config: FileSystemStoreConfig) =>
  (allEvents: AllEventsFeed<V>): Effect.Effect<FileSystemStore<V>, never, never> =>
    pipe(
      allEvents,
      createInitialStateWithAllEventsFeed<V>,
      SynchronizedRef.make<FileSystemStoreState<V>>,
      Effect.map(createStoreFromState(config))
    );

export const make = <V>(
  config: FileSystemStoreConfig
): Effect.Effect<FileSystemStore<V>, never, never> =>
  pipe(createAllEventsFeed<V>(), Effect.flatMap(createStoreWithAllEventsFeed(config)));
