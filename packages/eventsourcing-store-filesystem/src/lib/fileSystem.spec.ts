import { Effect, Layer, Schema, pipe } from 'effect';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Path } from '@effect/platform';
import { silentLogger } from '@codeforbreakfast/buntest';
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

const makeFooEventStoreLayer = () => {
  const testDir = pipe(
    Path.Path,
    Effect.map((path) =>
      path.join(
        tmpdir(),
        `eventsourcing-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
      )
    ),
    Effect.provide(BunPath.layer),
    Effect.runSync
  );
  // eslint-disable-next-line buntest/no-runSync-in-tests, effect/no-intermediate-effect-variables -- test setup needs synchronous store creation to share PubSub state across tests, testDir extracted from Effect for use as plain value
  const store = Effect.runSync(make<FooEvent>({ baseDir: testDir }));
  return FooEventStoreTest(store);
};

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

const makeStringEventStoreLayer = () => {
  // eslint-disable-next-line buntest/no-runSync-in-tests -- test setup needs synchronous store creation to share PubSub state across tests
  const store = Effect.runSync(
    make<string>({
      baseDir: pipe(
        Path.Path,
        Effect.map((path) =>
          path.join(
            tmpdir(),
            `eventsourcing-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
          )
        ),
        Effect.provide(BunPath.layer),
        Effect.runSync
      ),
    })
  );
  return Layer.effect(StringEventStore, makeFileSystemEventStore(store));
};

subscribeAllContract(
  'FileSystemEventStore',
  pipe(
    makeStringEventStoreLayer(),
    Layer.provide(BunFileSystem.layer),
    Layer.provide(BunPath.layer),
    Layer.provide(silentLogger)
  )
);
