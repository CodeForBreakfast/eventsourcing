import { Effect, Layer, Schema, pipe } from 'effect';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Path } from '@effect/platform';
import { silentLogger } from '@codeforbreakfast/buntest';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';
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
  const testDirEffect = pipe(
    Path.Path,
    Effect.map((path) =>
      path.join(
        tmpdir(),
        `eventsourcing-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
      )
    )
  );
  const storeEffect = pipe(
    testDirEffect,
    Effect.flatMap((testDir) => make<FooEvent>({ baseDir: testDir }))
  );
  const eventStoreLayer = pipe(storeEffect, Effect.map(FooEventStoreTest), Layer.unwrapEffect);
  return pipe(eventStoreLayer, Layer.provide(BunFileSystem.layer), Layer.provide(BunPath.layer));
};

runEventStoreTestSuite(
  'Filesystem',
  () => pipe(makeFooEventStoreLayer(), Layer.provide(silentLogger)),
  { supportsHorizontalScaling: false }
);
