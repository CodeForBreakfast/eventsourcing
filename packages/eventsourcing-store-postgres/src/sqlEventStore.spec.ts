import { Effect, Layer, Schema, pipe } from 'effect';
import { BunContext } from '@effect/platform-bun';
import { it } from '@codeforbreakfast/buntest';
import {
  runEventStoreTestSuite,
  FooEventStore,
  encodedEventStore,
} from '@codeforbreakfast/eventsourcing-store';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  makePgConfigurationLive,
} from './index';

import * as Logger from 'effect/Logger';

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;
const JsonFooEvent = Schema.parseJson(FooEvent);

const encodeFooEvents = Effect.map(encodedEventStore(JsonFooEvent));

const FooEventStoreEffect = Layer.effect(
  FooEventStore,
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- encodeFooEvents is a reusable transformation function
  pipe(sqlEventStore, encodeFooEvents)
);

// Complete test layer with all dependencies
const TestLayer = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- FooEventStoreEffect is reused as base for test layer composition
  FooEventStoreEffect,
  Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, Logger.pretty)),
  Layer.provide(PostgresLive),
  Layer.provide(makePgConfigurationLive('TEST_PG')),
  Layer.provide(BunContext.layer)
);

// Run the shared test suite for the PostgreSQL implementation
runEventStoreTestSuite('PostgreSQL', () => TestLayer);

// Simple test to verify it.effect works
it.effect('Simple test', () => Effect.succeed(42));
