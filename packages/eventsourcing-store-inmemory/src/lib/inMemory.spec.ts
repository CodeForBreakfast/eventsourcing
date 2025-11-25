import { Effect, Layer, Schema, pipe } from 'effect';
import { silentLogger } from '@codeforbreakfast/bun-test-effect';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
  EventStore,
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

subscribeAllContract(
  'InMemoryEventStore',
  Layer.provide(
    Layer.effect(StringEventStore, Effect.flatMap(make<string>(), makeInMemoryEventStore)),
    silentLogger
  )
);
