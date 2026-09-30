import { Chunk, Effect, Layer, Schema, Stream, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Path } from '@effect/platform';
import { silentLogger } from '@codeforbreakfast/bun-test-effect';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
  EventStore,
  EventStreamId,
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

const makeProvidedStringEventStoreLayer = () =>
  pipe(
    makeStringEventStoreLayer(),
    Layer.provide(BunFileSystem.layer),
    Layer.provide(BunPath.layer),
    Layer.provide(silentLogger)
  );

subscribeAllContract('FileSystemEventStore', makeProvidedStringEventStoreLayer());

const decodeStreamId = Schema.decodeSync(EventStreamId);
const streamId = decodeStreamId('immediate-stream');

const appendEvent = (store: EventStore<string>) =>
  pipe(
    ['event-after-subscribe'],
    Stream.fromIterable,
    Stream.run(store.append({ streamId, eventNumber: 0 }))
  );

const collectFirst = <A>(stream: Stream.Stream<A, unknown, never>) =>
  pipe(stream, Stream.take(1), Stream.runCollect);

const appendThenCollectFirst =
  (store: EventStore<string>) =>
  <A>(stream: Stream.Stream<A, unknown, never>) =>
    pipe(store, appendEvent, Effect.andThen(collectFirst(stream)), Effect.timeout('1 second'));

const runPerStreamTest = (store: EventStore<string>) =>
  pipe(
    { streamId, eventNumber: 0 },
    store.subscribe,
    Effect.flatMap(appendThenCollectFirst(store)),
    Effect.map((events) => {
      expect(Array.from(events)).toEqual(['event-after-subscribe']);
    })
  );

const runAllEventsTest = (store: EventStore<string>) =>
  pipe(
    store.subscribeAll(),
    Effect.flatMap(appendThenCollectFirst(store)),
    Effect.map((events) => {
      expect(Array.from(Chunk.map(events, (e) => e.event))).toEqual(['event-after-subscribe']);
    })
  );

describe('Subscriptions are live as soon as they return', () => {
  it('should deliver an event appended after subscribe returns but before the stream runs', () =>
    pipe(
      StringEventStore,
      Effect.flatMap(runPerStreamTest),
      Effect.provide(makeProvidedStringEventStoreLayer()),
      Effect.runPromise
    ));

  it('should deliver an event appended after subscribeAll returns but before the stream runs', () =>
    pipe(
      StringEventStore,
      Effect.flatMap(runAllEventsTest),
      Effect.provide(makeProvidedStringEventStoreLayer()),
      Effect.runPromise
    ));
});
