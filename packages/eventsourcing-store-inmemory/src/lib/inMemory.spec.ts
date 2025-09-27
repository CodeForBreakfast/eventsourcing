import { Effect, Layer, Schema, pipe } from 'effect';
import { silentLogger } from '@codeforbreakfast/buntest';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';
import { makeInMemoryEventStore } from './index';
import * as InMemoryStore from './InMemoryStore';

const LoggerLive = silentLogger;

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

export const FooEventStoreTest = (store: Readonly<InMemoryStore.InMemoryStore<FooEvent>>) =>
  Layer.effect(
    FooEventStore,
    pipe(store, makeInMemoryEventStore, Effect.map(encodedEventStore(FooEvent)))
  );

// Run the shared test suite for the in-memory implementation
// Note: In-memory store doesn't support horizontal scaling since each instance has its own memory
runEventStoreTestSuite(
  'In-memory',
  () =>
    pipe(
      pipe(InMemoryStore.make<FooEvent>(), Effect.map(FooEventStoreTest), Effect.runSync),
      Layer.provide(LoggerLive)
    ),
  { supportsHorizontalScaling: false }
);
