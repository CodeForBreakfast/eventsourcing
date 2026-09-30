import { Chunk, Effect, Layer, Schema, Stream, pipe } from 'effect';
import { describe, expect, it } from 'bun:test';
import { silentLogger } from '@codeforbreakfast/bun-test-effect';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
  EventStore,
  EventStreamId,
} from '@codeforbreakfast/eventsourcing-store';
import { subscribeAllContract } from '@codeforbreakfast/eventsourcing-testing-contracts';
import { makeInMemoryEventStore } from './index';
import { type InMemoryStore, make } from './InMemoryStore';

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

export const FooEventStoreTest = (store: InMemoryStore<FooEvent>) =>
  Layer.effect(
    FooEventStore,
    pipe(store, makeInMemoryEventStore, Effect.map(encodedEventStore(FooEvent)))
  );

const makeFooEventStoreLayer = () =>
  pipe(make<FooEvent>(), Effect.map(FooEventStoreTest), Effect.runSync);

// Run the shared test suite for the in-memory implementation
// Note: In-memory store doesn't support horizontal scaling since each instance has its own memory
runEventStoreTestSuite(
  'In-memory',
  () => pipe(makeFooEventStoreLayer(), Layer.provide(silentLogger)),
  { supportsHorizontalScaling: false }
);

class StringEventStore extends Effect.Tag('StringEventStore')<
  StringEventStore,
  EventStore<string>
>() {}

const StringEventStoreLayer = Layer.provide(
  Layer.effect(StringEventStore, Effect.flatMap(make<string>(), makeInMemoryEventStore)),
  silentLogger
);

subscribeAllContract('InMemoryEventStore', StringEventStoreLayer);

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
      Effect.provide(StringEventStoreLayer),
      Effect.runPromise
    ));

  it('should deliver an event appended after subscribeAll returns but before the stream runs', () =>
    pipe(
      StringEventStore,
      Effect.flatMap(runAllEventsTest),
      Effect.provide(StringEventStoreLayer),
      Effect.runPromise
    ));
});

const lagBehindEvents = 1000;

const appendOneEventAt = (store: EventStore<string>) => (eventNumber: number) =>
  pipe(
    ['event'],
    Stream.fromIterable,
    Stream.run(store.append({ streamId: decodeStreamId('lagging-stream'), eventNumber }))
  );

const stallOnEveryEvent = () => Effect.never;

const startSubscriberThatNeverDrains = (store: EventStore<string>) =>
  pipe(store.subscribeAll(), Effect.flatMap(Stream.runForEach(stallOnEveryEvent)), Effect.fork);

const appendManyEvents = (store: EventStore<string>) =>
  Effect.forEach(
    Array.from({ length: lagBehindEvents }, (_, i) => i),
    appendOneEventAt(store),
    { discard: true }
  );

const runLaggingSubscriberTest = (store: EventStore<string>) =>
  pipe(
    startSubscriberThatNeverDrains(store),
    Effect.andThen(Effect.yieldNow()),
    Effect.andThen(appendManyEvents(store)),
    Effect.timeout('2 seconds')
  );

describe('A slow subscriber', () => {
  it('should not stall appends however far it lags behind', () =>
    pipe(
      StringEventStore,
      Effect.flatMap(runLaggingSubscriberTest),
      Effect.scoped,
      Effect.provide(StringEventStoreLayer),
      Effect.runPromise
    ));
});
