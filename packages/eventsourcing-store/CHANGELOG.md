# @codeforbreakfast/eventsourcing-store

## 0.3.0

### Minor Changes

- [#40](https://github.com/CodeForBreakfast/eventsourcing/pull/40) [`14dc032`](https://github.com/CodeForBreakfast/eventsourcing/commit/14dc03252da28c9c6e5174ffd91549962cca3368) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored package boundaries for better separation of concerns
  - SQL/PostgreSQL implementation moved from `@codeforbreakfast/eventsourcing-store` to new `@codeforbreakfast/eventsourcing-store-postgres` package
    - Core package now only contains interfaces, types, and in-memory implementation
    - PostgreSQL users must now install `@codeforbreakfast/eventsourcing-store-postgres` separately
    - Import paths changed: `import { PostgresLive } from '@codeforbreakfast/eventsourcing-store-postgres'`
  - Aggregates package no longer depends on projections package
    - Better separation between write-side and read-side concerns
    - Aggregates now use direct EventStore interface instead of projection adapters
  - Added reusable test suite for EventStore implementations
    - Export `runEventStoreTestSuite` from core package for testing any EventStore implementation
    - Ensures consistent behavior across all implementations

## 0.2.0

### Minor Changes

- [#26](https://github.com/CodeForBreakfast/eventsourcing/pull/26) [`d791f62`](https://github.com/CodeForBreakfast/eventsourcing/commit/d791f621433a491bcd4251ba0c7bdc53d1c66139) Thanks [@GraemeF](https://github.com/GraemeF)! - ## Breaking Changes: API Standardization and Service Pattern Improvements

  ### Service Definition Patterns
  - **BREAKING**: Renamed `EventStoreServiceInterface` to `EventStore` for cleaner naming
  - **BREAKING**: Renamed `ProjectionStoreServiceInterface` to `ProjectionStore`
  - **BREAKING**: Renamed `SnapshotStoreServiceInterface` to `SnapshotStore`
  - Updated `CommandContext` and `CurrentUser` services to use `Effect.Tag` pattern with proper interfaces
  - Removed deprecated `EventStore<TEvent>` interface (was already marked deprecated)

  ### Documentation Improvements
  - Added comprehensive JSDoc documentation to core APIs
  - Added examples showing pipe composition patterns with currying
  - Documented error types with `@throws` tags
  - Added `@since` tags for version tracking

  ### Type Safety Enhancements
  - Fixed service tag patterns for better type inference
  - Standardized generic parameter ordering across all packages

  ### Migration Guide

  Update your imports:

  ```typescript
  // Before
  import type { EventStoreServiceInterface } from '@codeforbreakfast/eventsourcing-store';

  // After
  import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
  ```

  Update service definitions:

  ```typescript
  // Before
  class MyEventStore extends Effect.Tag('MyEventStore')<
    MyEventStore,
    EventStoreServiceInterface<MyEvent>
  >() {}

  // After
  class MyEventStore extends Effect.Tag('MyEventStore')<MyEventStore, EventStore<MyEvent>>() {}
  ```
