# @codeforbreakfast/eventsourcing-store-postgres

## 0.5.0

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

### Patch Changes

- Updated dependencies [[`ee425bf`](https://github.com/CodeForBreakfast/eventsourcing/commit/ee425bf5f0be3e0f6b08f18591ce4b3a13764b76), [`73ca9d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/73ca9d44adca717e75edc04b6dd6d02fdd8afbf1), [`73ca9d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/73ca9d44adca717e75edc04b6dd6d02fdd8afbf1)]:
  - @codeforbreakfast/eventsourcing-store@0.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`21ee4c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/21ee4c2a65805f30eccdea64df0843a963af3e8a)]:
  - @codeforbreakfast/eventsourcing-store@0.5.0

## 0.4.0

### Minor Changes

- [#43](https://github.com/CodeForBreakfast/eventsourcing/pull/43) [`7f00d80`](https://github.com/CodeForBreakfast/eventsourcing/commit/7f00d801375c785f41e3fad325ad98c60892028b) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved npm documentation and discoverability:
  - Added comprehensive README documentation for all packages
  - Enhanced package.json descriptions to highlight Effect integration
  - Added Effect-focused keywords for better npm search visibility
  - Included usage examples and getting started guides
  - Fixed all code examples to use idiomatic Effect patterns

### Patch Changes

- Updated dependencies [[`7f00d80`](https://github.com/CodeForBreakfast/eventsourcing/commit/7f00d801375c785f41e3fad325ad98c60892028b)]:
  - @codeforbreakfast/eventsourcing-store@0.4.0

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

### Patch Changes

- Updated dependencies [[`14dc032`](https://github.com/CodeForBreakfast/eventsourcing/commit/14dc03252da28c9c6e5174ffd91549962cca3368)]:
  - @codeforbreakfast/eventsourcing-store@0.3.0
