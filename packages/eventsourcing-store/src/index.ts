// Core types
export * from './lib/streamTypes';
export * from './lib/domainTypes';
export * from './lib/errors';
export * from './lib/services';
export * from './lib/eventstore';

// In-memory implementation
export {
  makeInMemoryEventStore,
  makeSubscribableInMemoryEventStore,
  type SubscribableEventStore,
  InMemoryStore,
  make as makeInMemoryStore,
} from './lib/inMemory';

// Streaming utilities
export {
  StreamHandler,
  StreamHandlerLive,
  makeStreamHandler,
  StreamingError,
  type StreamHandlerService,
} from './lib/streaming';

// Testing utilities
export * from './lib/testing/eventstore-test-suite';

// Note: SQL/PostgreSQL implementation moved to @codeforbreakfast/eventsourcing-store-postgres
