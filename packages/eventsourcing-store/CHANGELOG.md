# @codeforbreakfast/eventsourcing-store

## 0.6.7

### Patch Changes

- [#79](https://github.com/CodeForBreakfast/eventsourcing/pull/79) [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix release pipeline failures caused by TypeScript build issues

  The release process was failing because packages with `workspace:*` dependencies were rebuilding during publish via `prepublishOnly` hooks. This caused TypeScript compilation errors when dependent packages tried to build in parallel without access to their dependencies' declaration files.

  **Solution:**
  - Removed `prepublishOnly` hooks from all packages (turbo already handles build order correctly)
  - Updated release script to use `changeset publish` directly instead of custom turbo publish tasks
  - Ensured all packages are built in dependency order before publishing begins

  This ensures a smooth release process where:
  1. All packages build in correct dependency order (respecting workspace dependencies)
  2. Changesets handles publishing with proper version resolution
  3. No parallel rebuild issues during the publish phase

- [#79](https://github.com/CodeForBreakfast/eventsourcing/pull/79) [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplified release validation using changesets' native tools. The CI now validates:
  - Changeset status to ensure changes have appropriate version bumps
  - Build success for all packages
  - Publish readiness via changesets publish --dry-run

  This provides focused, relevant validation without unnecessary checks, ensuring smooth releases while keeping CI fast and maintainable.

## 0.6.6

### Patch Changes

- [#73](https://github.com/CodeForBreakfast/eventsourcing/pull/73) [`7cec47a`](https://github.com/CodeForBreakfast/eventsourcing/commit/7cec47a3cf6741febd99f96dec4cadb1923543c2) Thanks [@GraemeF](https://github.com/GraemeF)! - Documentation updates to match current codebase implementation:
  - Fixed incorrect package names and import paths
  - Updated API examples and function signatures
  - Corrected WebSocket usage patterns
  - Removed outdated temporary documentation

- [#74](https://github.com/CodeForBreakfast/eventsourcing/pull/74) [`ff5231c`](https://github.com/CodeForBreakfast/eventsourcing/commit/ff5231c27122a47839b3aedf162c00f30f5e3257) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved CI validation to prevent release failures. The changeset validation now:
  - Detects when code changes are made without changesets (preventing npm republish failures)
  - Checks if package versions already exist on npm
  - Provides clear guidance on creating changesets with consumer-focused messages
  - Distinguishes between code changes (requiring changesets) and documentation-only changes (optional)

## 0.6.5

### Patch Changes

- [#62](https://github.com/CodeForBreakfast/eventsourcing/pull/62) [`ecd91f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/ecd91f3a05de08f82752ddf8f6f5c6d5238cec78) Thanks [@GraemeF](https://github.com/GraemeF)! - Export InMemoryStore class and make function for testing support

  The `InMemoryStore` class and `make` function (exported as `makeInMemoryStore`) are now available from the main package exports. This allows users to create in-memory event stores for testing scenarios without needing to access internal module paths.

  ## New exports
  - `InMemoryStore` - The class for managing in-memory event storage
  - `makeInMemoryStore` - Factory function to create a new InMemoryStore instance

  ## Example usage

  ```typescript
  import { Effect } from 'effect';
  import {
    InMemoryStore,
    makeInMemoryStore,
    makeInMemoryEventStore,
  } from '@codeforbreakfast/eventsourcing-store';

  // Create an in-memory store for testing
  const store = await Effect.runPromise(makeInMemoryStore<MyEventType>());
  const eventStore = await Effect.runPromise(makeInMemoryEventStore(store));
  ```

## 0.6.4

### Patch Changes

- [#60](https://github.com/CodeForBreakfast/eventsourcing/pull/60) [`e61e1da`](https://github.com/CodeForBreakfast/eventsourcing/commit/e61e1da32d2fecafc0e6e638cb0ca0daa49fada7) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix prepublishOnly script to maintain build dependency chain

  The prepublishOnly script was doing a clean build (`clean && build`) which broke the dependency chain established by Turbo's build ordering. This caused packages that depend on other workspace packages to fail TypeScript compilation during publishing because their dependencies' TypeScript definitions weren't available.

  Changed prepublishOnly from `bun run clean && bun run build` to just `bun run build` to maintain the build artifacts and dependency chain established by the main build process.

## 0.6.3

### Patch Changes

- [#58](https://github.com/CodeForBreakfast/eventsourcing/pull/58) [`b391253`](https://github.com/CodeForBreakfast/eventsourcing/commit/b391253c9b298de5d8712b147a4bfefff4295a90) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix TypeScript definition generation in build process

  The build process was not properly generating TypeScript definition files for published packages due to incremental compilation cache issues. This fix adds the `--force` flag to the TypeScript compiler to ensure definition files are always generated during the build process.

  This resolves issues where consumers of these packages would not have proper TypeScript intellisense and type checking.

## 0.6.2

### Patch Changes

- [#57](https://github.com/CodeForBreakfast/eventsourcing/pull/57) [`10bc57b`](https://github.com/CodeForBreakfast/eventsourcing/commit/10bc57b88b396f9536d0ec3afa670f41991b181c) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix workspace protocol dependencies in published packages

  The published packages incorrectly included `workspace:*` protocol in their dependencies, making them impossible to install outside the monorepo. This was caused by changesets not supporting Bun's workspace protocol.

  The fix updates the release workflow to:
  1. Run `bun update` after versioning to resolve workspace references
  2. Use `bun publish` directly instead of `changeset publish`
  3. Run `changeset tag` to create git tags after publishing

  This ensures published packages have proper version constraints instead of workspace protocols.

## 0.6.1

### Patch Changes

- Fix workspace protocol dependencies in published packages

  The published packages incorrectly included workspace:\* protocol in their dependencies, making them impossible to install outside the monorepo. This patch ensures proper version numbers are used in published packages.

## 0.6.0

### Minor Changes

- [#49](https://github.com/CodeForBreakfast/eventsourcing/pull/49) [`ee425bf`](https://github.com/CodeForBreakfast/eventsourcing/commit/ee425bf5f0be3e0f6b08f18591ce4b3a13764b76) Thanks [@GraemeF](https://github.com/GraemeF)! - Rename EventStore `write` method to `append` for better semantic clarity

  The `write` method on the EventStore interface has been renamed to `append` to more accurately reflect its purpose - events can only be appended to the end of a stream, not written arbitrarily. The method signature and behavior remain the same, with the position parameter used for optimistic concurrency control to detect conflicts.

  ### Breaking Changes
  - `EventStore.write()` is now `EventStore.append()`
  - All implementations and usages have been updated accordingly

  ### Migration Guide

  Update all calls from:

  ```typescript
  eventStore.write(position);
  ```

  To:

  ```typescript
  eventStore.append(position);
  ```

- [#47](https://github.com/CodeForBreakfast/eventsourcing/pull/47) [`73ca9d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/73ca9d44adca717e75edc04b6dd6d02fdd8afbf1) Thanks [@GraemeF](https://github.com/GraemeF)! - feat!: Simplify EventStore API to just read and subscribe methods

  ## Breaking Changes

  ### EventStore Interface Simplified

  The EventStore interface now has just three methods:
  - `write`: Write events to a stream
  - `read`: Read historical events only (no live updates)
  - `subscribe`: Read historical events then continue with live updates

  ### Removed APIs
  - **Removed `readHistorical` method** - Use `read` instead (it now returns only historical events)
  - **Removed `ReadParams` and `ReadOptions` types** - Use EventStreamPosition with Stream combinators
  - **Removed complex parameter overloading** - Methods now have single, clear parameter types

  ## Migration Guide

  ### Reading Historical Events

  ```typescript
  // Before
  eventStore.readHistorical({ streamId, eventNumber });

  // After
  eventStore.read({ streamId, eventNumber });
  ```

  ### Advanced Operations with Stream Combinators

  ```typescript
  // Reading a range (before)
  eventStore.read({
    streamId,
    fromEventNumber: 50,
    toEventNumber: 100,
  });

  // Reading a range (after)
  eventStore.read({ streamId, eventNumber: 50 }).pipe(
    Effect.map(Stream.take(51)) // take events 50-100
  );

  // Reading in reverse (before)
  eventStore.read({ streamId, direction: 'backward' });

  // Reading in reverse (after)
  eventStore
    .read({ streamId, eventNumber: 0 })
    .pipe(
      Effect.map(
        flow(Stream.runCollect, Effect.map(Chunk.reverse), Effect.flatMap(Stream.fromChunk))
      )
    );
  ```

  ## Benefits
  - **Clearer API**: Explicit separation between historical reads and live subscriptions
  - **Simpler types**: No complex union types or parameter overloading
  - **Better composability**: Leverage Effect's powerful Stream combinators
  - **Smaller API surface**: Fewer methods to understand and maintain

  ## Notes

  This change removes theoretical optimizations that were never implemented (like database-level filtering for ranges). These can be added back as specialized methods if performance requirements demand it in the future.

- [#47](https://github.com/CodeForBreakfast/eventsourcing/pull/47) [`73ca9d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/73ca9d44adca717e75edc04b6dd6d02fdd8afbf1) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplified EventStore API to have just two core methods for reading events

  ## Breaking Changes

  The EventStore interface has been simplified to provide a cleaner, more intuitive API:

  ### Before

  ```typescript
  interface EventStore<TEvent> {
    write(to: EventStreamPosition): Sink<...>
    read(params: ReadParams | EventStreamPosition): Effect<Stream<...>>
    readHistorical(params: ReadParams | EventStreamPosition): Effect<Stream<...>>
  }
  ```

  ### After

  ```typescript
  interface EventStore<TEvent> {
    write(to: EventStreamPosition): Sink<...>
    read(from: EventStreamPosition): Effect<Stream<...>>    // Historical events only
    subscribe(from: EventStreamPosition): Effect<Stream<...>> // Historical + live events
  }
  ```

  ### Key Changes
  1. **`read` method** - Now returns only historical events (no live updates)
  2. **`subscribe` method** - New method that returns historical events followed by live updates
  3. **Removed `readHistorical`** - Use `read` instead for historical-only access
  4. **Removed `ReadParams`** - Use Stream combinators for advanced operations

  ### Migration Guide

  #### Reading historical events only

  ```typescript
  // Before
  eventStore.readHistorical(position);
  // After
  eventStore.read(position);
  ```

  #### Getting live updates

  ```typescript
  // Before
  eventStore.read(position); // Would include live updates
  // After
  eventStore.subscribe(position); // Explicitly subscribe for live updates
  ```

  #### Advanced operations (filtering, pagination, reverse order)

  ```typescript
  // Before - using ReadParams
  eventStore.read({
    streamId,
    fromEventNumber: 10,
    toEventNumber: 20,
    direction: 'backward',
    batchSize: 5,
  });

  // After - using Stream combinators
  pipe(
    eventStore.read(position),
    Effect.map((stream) =>
      pipe(
        stream,
        Stream.drop(10),
        Stream.take(11),
        Stream.grouped(5),
        // For reverse order, collect and reverse
        Stream.runCollect,
        Effect.map(Chunk.reverse)
      )
    )
  );
  ```

  ### Benefits
  - **Clearer intent** - Explicit separation between reading historical data and subscribing to updates
  - **Simpler API** - Only 3 methods instead of complex parameter objects
  - **Better composability** - Leverage Effect's Stream combinators for advanced operations
  - **Type safety** - No more union types for parameters, clearer type signatures

  ### Deprecated Types

  The following types are deprecated and will be removed in a future version:
  - `ReadParams`
  - `ReadOptions`

  Continue using Stream combinators from Effect for operations like filtering, batching, and reversing.

## 0.5.0

### Minor Changes

- [#45](https://github.com/CodeForBreakfast/eventsourcing/pull/45) [`21ee4c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/21ee4c2a65805f30eccdea64df0843a963af3e8a) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplify and improve API naming conventions

  ### Breaking Changes
  - Renamed `OptimizedStreamHandler` to `StreamHandler` - there was no non-optimized version, making the "Optimized" prefix misleading
  - Renamed `EnhancedEventStore` interface to `SubscribableEventStore` - explicitly describes what it adds over the base EventStore
  - Renamed factory functions to follow Effect-ts conventions:
    - `inMemoryEventStore` → `makeInMemoryEventStore`
    - `enhancedInMemoryEventStore` → `makeSubscribableInMemoryEventStore`

  ### Migration Guide

  Update your imports and usage:

  ```typescript
  // Before
  import {
    OptimizedStreamHandler,
    OptimizedStreamHandlerLive,
    enhancedInMemoryEventStore,
  } from '@codeforbreakfast/eventsourcing-store';

  // After
  import {
    StreamHandler,
    StreamHandlerLive,
    makeSubscribableInMemoryEventStore,
  } from '@codeforbreakfast/eventsourcing-store';
  ```

  These changes make the API more predictable and easier to understand by removing unnecessary marketing terms and following consistent naming patterns.

## 0.4.0

### Minor Changes

- [#43](https://github.com/CodeForBreakfast/eventsourcing/pull/43) [`7f00d80`](https://github.com/CodeForBreakfast/eventsourcing/commit/7f00d801375c785f41e3fad325ad98c60892028b) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved npm documentation and discoverability:
  - Added comprehensive README documentation for all packages
  - Enhanced package.json descriptions to highlight Effect integration
  - Added Effect-focused keywords for better npm search visibility
  - Included usage examples and getting started guides
  - Fixed all code examples to use idiomatic Effect patterns

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
