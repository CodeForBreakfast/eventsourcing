import { Logger, Effect, Layer, Schema, pipe } from 'effect';
import { runEventStoreTestSuite, FooEventStore } from '../testing/eventstore-test-suite';
import { encodedEventStore } from '../eventstore';
import { makeInMemoryEventStore } from './index';
import * as InMemoryStore from './InMemoryStore';

const LoggerLive = Logger.pretty;

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

export const FooEventStoreTest = (store: Readonly<InMemoryStore.InMemoryStore<FooEvent>>) =>
  Layer.effect(
    FooEventStore,
    pipe(store, makeInMemoryEventStore, Effect.map(encodedEventStore(FooEvent)))
  );

// Run the shared test suite for the in-memory implementation
runEventStoreTestSuite('In-memory', () =>
  pipe(
    pipe(InMemoryStore.make<FooEvent>(), Effect.map(FooEventStoreTest), Effect.runSync),
    Layer.provide(LoggerLive)
  )
);
