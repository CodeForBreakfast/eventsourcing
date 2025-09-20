// Core types
export * from './lib/streamTypes';
export * from './lib/errors';
export * from './lib/services';
export * from './lib/eventstore';

// In-memory implementation
export {
  inMemoryEventStore,
  enhancedInMemoryEventStore,
  type EnhancedEventStore
} from './lib/inMemory';

// Streaming utilities
export {
  OptimizedStreamHandler,
  OptimizedStreamHandlerLive,
  makeOptimizedStreamHandler,
  StreamingError,
  type OptimizedStreamHandlerService
} from './lib/streaming';

// SQL/PostgreSQL implementation
export {
  PostgresLive,
  PgConfiguration,
  PgConfigurationLive,
  PgLive,
  type PgConfigurationInterface
} from './lib/sql';
