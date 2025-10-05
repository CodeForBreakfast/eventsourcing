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
const LoggerLive = Logger.pretty;

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;
const JsonFooEvent = Schema.parseJson(FooEvent);

export const FooEventStoreLive = Layer.effect(
  FooEventStore,
  pipe(sqlEventStore, Effect.map(encodedEventStore(JsonFooEvent)))
);

// Complete test layer with all dependencies
const TestLayer = pipe(
  FooEventStoreLive,
  Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, LoggerLive)),
  Layer.provide(PostgresLive),
  Layer.provide(makePgConfigurationLive('TEST_PG')),
  Layer.provide(BunContext.layer)
);

// Run the shared test suite for the PostgreSQL implementation
runEventStoreTestSuite('PostgreSQL', () => TestLayer);

// Simple test to verify it.effect works
it.effect('Simple test', () => Effect.succeed(42));
