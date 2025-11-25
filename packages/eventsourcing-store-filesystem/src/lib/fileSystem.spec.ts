import { Effect, Layer, Schema, pipe } from 'effect';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Path } from '@effect/platform';
import { silentLogger } from '@codeforbreakfast/bun-test-effect';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
  EventStore,
} from '@codeforbreakfast/eventsourcing-store';
import { subscribeAllContract } from '@codeforbreakfast/eventsourcing-testing-contracts';
import { makeFileSystemEventStore } from './index';
import { type FileSystemStore, make } from './FileSystemStore';
import { tmpdir } from 'node:os';

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

export const FooEventStoreTest = (store: FileSystemStore<FooEvent>) =>
  Layer.effect(
    FooEventStore,
    pipe(store, makeFileSystemEventStore, Effect.map(encodedEventStore(FooEvent)))
  );

const makeFooEventStoreLayer = () =>
  pipe(
    Path.Path,
    Effect.map((path) =>
      path.join(tmpdir(), `eventsourcing-test-${crypto.randomUUID().substring(0, 8)}`)
    ),
    Effect.flatMap((testDir) => make<FooEvent>({ baseDir: testDir })),
    Effect.map(FooEventStoreTest),
    Effect.provide(BunPath.layer),
    Effect.runSync
  );

runEventStoreTestSuite(
  'Filesystem',
  () =>
    pipe(
      makeFooEventStoreLayer(),
      Layer.provide(BunFileSystem.layer),
      Layer.provide(BunPath.layer),
      Layer.provide(silentLogger)
    ),
  { supportsHorizontalScaling: false }
);

class StringEventStore extends Effect.Tag('StringEventStore')<
  StringEventStore,
  EventStore<string>
>() {}

const makeStringEventStoreLayer = () =>
  Layer.effect(
    StringEventStore,
    pipe(
      Path.Path,
      Effect.map((path) =>
        path.join(tmpdir(), `eventsourcing-test-${crypto.randomUUID().substring(0, 8)}`)
      ),
      Effect.flatMap((testDir) => make<string>({ baseDir: testDir })),
      Effect.flatMap(makeFileSystemEventStore),
      Effect.provide(BunPath.layer)
    )
  );

subscribeAllContract(
  'FileSystemEventStore',
  pipe(
    makeStringEventStoreLayer(),
    Layer.provide(BunFileSystem.layer),
    Layer.provide(BunPath.layer),
    Layer.provide(silentLogger)
  )
);
