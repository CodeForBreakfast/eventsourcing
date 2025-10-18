// Core types
export * from './lib/streamTypes';
export * from './lib/domainTypes';
export * from './lib/errors';
export * from './lib/services';
export * from './lib/eventstore';

// Note: In-memory implementation moved to @codeforbreakfast/eventsourcing-store-inmemory

// Streaming utilities
export { StreamingError, type StreamHandlerService } from './lib/streaming';

// Note: Testing utilities moved to '@codeforbreakfast/eventsourcing-store/testing' subpath export
// Note: SQL/PostgreSQL implementation moved to @codeforbreakfast/eventsourcing-store-postgres
