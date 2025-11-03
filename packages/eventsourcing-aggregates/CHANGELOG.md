# @codeforbreakfast/eventsourcing-aggregates

## 0.9.2

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor test code to follow proper functional programming patterns

  This is an internal refactoring of test code to eliminate ESLint rule violations by following proper Effect functional programming patterns. No public API changes.

- Updated dependencies [[`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4), [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.7
  - @codeforbreakfast/eventsourcing-store@0.9.1

## 0.9.1

### Patch Changes

- [#332](https://github.com/CodeForBreakfast/eventsourcing/pull/332) [`e177936`](https://github.com/CodeForBreakfast/eventsourcing/commit/e177936ba898dcf8dfdaabbf413cd483cd5b90b7) Thanks [@GraemeF](https://github.com/GraemeF)! - Introduce `StreamEvent<T>` type to consolidate event-with-position pattern

  This change introduces a new `StreamEvent<T>` type that represents an event with its stream position metadata. This replaces the verbose `{ readonly position: EventStreamPosition; readonly event: T }` pattern used throughout the codebase.

  **What changed:**
  - Added `StreamEvent<T>` type and Schema to `@codeforbreakfast/eventsourcing-store`
  - Updated `EventStore.subscribeAll()` to return `Stream<StreamEvent<T>>` instead of `Stream<{ position, event }>`
  - Refactored internal implementations in postgres, inmemory, and filesystem stores to use the new type
  - Removed redundant object mapping in SQL event store subscription

  **Migration:**
  If you're using `EventStore.subscribeAll()`, you can now use the `StreamEvent<T>` type for better type inference:

  ```typescript
  // Before
  type EventWithPos = { readonly position: EventStreamPosition; readonly event: MyEvent };

  // After
  import { type StreamEvent } from '@codeforbreakfast/eventsourcing-store';
  type EventWithPos = StreamEvent<MyEvent>;
  ```

  The change is backward compatible as the structure remains identical.

- Updated dependencies [[`e177936`](https://github.com/CodeForBreakfast/eventsourcing/commit/e177936ba898dcf8dfdaabbf413cd483cd5b90b7)]:
  - @codeforbreakfast/eventsourcing-store@0.9.0
  - @codeforbreakfast/eventsourcing-commands@0.4.6

## 0.9.0

### Minor Changes

- [#291](https://github.com/CodeForBreakfast/eventsourcing/pull/291) [`8bb87c3`](https://github.com/CodeForBreakfast/eventsourcing/commit/8bb87c3605cf30ed020fe5f9bbabb2f60cdaa172) Thanks [@GraemeF](https://github.com/GraemeF)! - Add `defineAggregateEventStore` factory function for creating standardized event store tags.

  This factory provides a consistent, type-safe way to create EventStore tags for aggregates with deterministic keys:

  \`\`\`typescript
  import { defineAggregateEventStore } from '@codeforbreakfast/eventsourcing-aggregates';

  export const TodoEventStore = defineAggregateEventStore<TodoEvent, UserId>('Todo');
  \`\`\`

  The factory automatically generates the tag identifier as `{AggregateName}/EventStore`, reducing boilerplate and ensuring consistent naming across all aggregates.

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.5
  - @codeforbreakfast/eventsourcing-store@0.8.5

## 0.8.2

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-store@0.8.4
  - @codeforbreakfast/eventsourcing-commands@0.4.4

## 0.8.1

### Patch Changes

- [#258](https://github.com/CodeForBreakfast/eventsourcing/pull/258) [`74564cd`](https://github.com/CodeForBreakfast/eventsourcing/commit/74564cd90e86c91dd462a747f2ad70d9cdf371ad) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed a critical bug where aggregate event numbers were not correctly tracked when loading aggregates from the event store. Previously, the `nextEventNumber` was always reset to 0 during event replay, causing concurrency conflicts when attempting to commit new events. Aggregates now correctly maintain their event position after loading, ensuring proper optimistic concurrency control.

- [#255](https://github.com/CodeForBreakfast/eventsourcing/pull/255) [`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated internal implementation to comply with `no-if-statement` rule.

  Test code now uses if statements where appropriate (for assertions and side effects), while production code follows functional patterns. This is an internal refactoring with no API changes.

- [#259](https://github.com/CodeForBreakfast/eventsourcing/pull/259) [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add Effect-native assertions and new ESLint rules

  **New Features:**
  - **buntest**: Added Effect-native assertion utilities (`expectEffect`, `toSucceedWith`, `toFailWith`) and a new ESLint rule `prefer-effect-assertions` to enforce their usage
  - **eslint-effect**: Added two new rules: `no-effect-if-option-check` and `prefer-get-or-undefined`

  **Bug Fixes & Improvements:**
  - Replaced `Effect.sync(expect())` patterns with Effect-native assertions across test suites
  - Removed unnecessary function aliases to improve code readability
  - Fixed nested pipe calls and redundant Effect.sync wrappers

- Updated dependencies [[`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe), [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.3
  - @codeforbreakfast/eventsourcing-store@0.8.3

## 0.8.0

### Minor Changes

- [#237](https://github.com/CodeForBreakfast/eventsourcing/pull/237) [`9087d1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/9087d1a1661f3064cb07bf702100df91c4e3dd5f) Thanks [@GraemeF](https://github.com/GraemeF)! - Automatic metadata enrichment for event sourcing. Commands now emit bare business events, and the framework automatically enriches them with metadata (occurredAt, origin) before persisting. This keeps domain logic pure and separates business concerns from infrastructure.

  **Breaking Changes:**
  - Commands return bare events (`TEvent[]`) without metadata
  - Framework enriches events to `EventRecord<TEvent, TOrigin>` during commit
  - Metadata field renamed: `originator` → `origin`
  - `applyEvent` receives bare `TEvent` (metadata stripped during load)
  - EventStore type now explicit: `EventStore<EventRecord<TEvent, TOrigin>>`
  - `eventSchema` signature changed: removed `originSchema` parameter (creates bare events without metadata)

  **New Exports:**
  - `EventRecord<TEvent, TOrigin>` - Enriched events with metadata wrapper
  - `EventMetadata<TOrigin>` - Event metadata structure (occurredAt, origin)

  **WebSocket Transport:**
  - Added optional `authenticateConnection` callback for secure connection authentication
  - Authentication metadata flows to `ClientConnection.metadata`

### Patch Changes

- [#237](https://github.com/CodeForBreakfast/eventsourcing/pull/237) [`9087d1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/9087d1a1661f3064cb07bf702100df91c4e3dd5f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved type safety in aggregate state loading and event committing. The aggregate state's `data` field now correctly preserves its type (e.g., `Option<TodoState>`) instead of being typed as `Option<unknown>`, eliminating the need for type assertions when working with aggregate state. Additionally, `CommitOptions` is now generic over the event type, ensuring type safety throughout the commit pipeline.

- [#241](https://github.com/CodeForBreakfast/eventsourcing/pull/241) [`e117dfa`](https://github.com/CodeForBreakfast/eventsourcing/commit/e117dfa216250ce2a6bc24b22fee03fc6e21ef26) Thanks [@GraemeF](https://github.com/GraemeF)! - Enhanced type safety throughout aggregate roots and event handling. The `makeAggregateRoot` function now returns a properly typed `AggregateRoot` interface that preserves command handler types, eliminating the need for unsafe type assertions in consumer code. This improvement allows TypeScript to verify command usage at compile time and prevents runtime type errors.

  **Improvements:**
  - `makeAggregateRoot` now returns `AggregateRoot<TId, TState, TEvent, TInitiator, TCommands, TTag>` interface
  - Command handlers maintain their specific return types through the aggregate root
  - Removed internal `stripMetadata` function (structural typing makes it unnecessary)

- Updated dependencies []:
  - @codeforbreakfast/eventsourcing-commands@0.4.2
  - @codeforbreakfast/eventsourcing-store@0.8.2

## 0.7.2

### Patch Changes

- [#228](https://github.com/CodeForBreakfast/eventsourcing/pull/228) [`2f58e66`](https://github.com/CodeForBreakfast/eventsourcing/commit/2f58e665f90f3296f1e1b58bff89a7838365221a) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality and maintainability by eliminating unnecessary function wrappers throughout the codebase. These internal refactoring changes improve code readability and consistency without affecting any public APIs or behavior. All packages continue to work exactly as before with no breaking changes.

- Updated dependencies [[`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb)]:
  - @codeforbreakfast/eventsourcing-store@0.8.2
  - @codeforbreakfast/eventsourcing-commands@0.4.2

## 0.7.1

### Patch Changes

- Updated dependencies [[`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767)]:
  - @codeforbreakfast/eventsourcing-store@0.8.1
  - @codeforbreakfast/eventsourcing-commands@0.4.1

## 0.7.0

### Minor Changes

- [#157](https://github.com/CodeForBreakfast/eventsourcing/pull/157) [`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove deprecated Command type export and clean up legacy code

  **BREAKING CHANGE**: The deprecated `Command` type export has been removed from `@codeforbreakfast/eventsourcing-commands`. Use `WireCommand` instead for transport layer commands.
  - Removed deprecated `Command` type export - use `WireCommand` for clarity about transport layer vs domain commands
  - Updated all internal references from `Command` to `WireCommand`
  - Removed migration guides and backward compatibility documentation
  - Cleaned up legacy helper functions and test comments

  To update your code:

  ```typescript
  // Before
  import { Command } from '@codeforbreakfast/eventsourcing-commands';

  // After
  import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
  ```

- [#170](https://github.com/CodeForBreakfast/eventsourcing/pull/170) [`4e9f8c9`](https://github.com/CodeForBreakfast/eventsourcing/commit/4e9f8c9711df00e01b0ab943dad67aa14d59df06) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce domain-specific event types throughout the command processing layer. Command handlers and routers are now generic over your domain event types, preventing accidental use of generic `Event` types with `unknown` data in domain code.

  **Breaking Changes:**
  - `CommandHandler` and `CommandRouter` are now generic interfaces that require a type parameter
  - `createCommandProcessingService` now requires an event store tag parameter before the router parameter
  - Factory functions with default type parameters have been removed from service tag creation

  **Migration:**

  Before:

  ```typescript
  const handler: CommandHandler = {
    execute: () => Effect.succeed([{ type: 'Created', data: {...} } as Event])
  };

  const service = createCommandProcessingService(router);
  ```

  After:

  ```typescript
  // 1. Define domain events
  const MyEvent = Schema.Union(Created, Updated);
  type MyEvent = typeof MyEvent.Type;

  // 2. Create domain-specific event store tag
  const MyEventStore = Context.GenericTag<EventStore<MyEvent>, EventStore<MyEvent>>('MyEventStore');

  // 3. Use typed handlers
  const handler: CommandHandler<MyEvent> = {
    execute: () => Effect.succeed([{ type: 'Created', data: {...} }])
  };

  // 4. Provide event store tag to factory
  const service = createCommandProcessingService(MyEventStore)(router);
  ```

  The generic `Event` type remains available for serialization boundaries (storage implementations, wire protocol) but should not be used in domain logic.

  See ARCHITECTURE.md for detailed design rationale and migration guidance.

- [#195](https://github.com/CodeForBreakfast/eventsourcing/pull/195) [`11e726e`](https://github.com/CodeForBreakfast/eventsourcing/commit/11e726e73a7f36f3321f32e16d20eb578a1595d1) Thanks [@GraemeF](https://github.com/GraemeF)! - Make CommandContext and event metadata generic over initiator type. Command initiator is now supplied when creating aggregates and event schemas. The originator field optionality is configurable by the caller.

### Patch Changes

- [#200](https://github.com/CodeForBreakfast/eventsourcing/pull/200) [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43) Thanks [@GraemeF](https://github.com/GraemeF)! - Enhanced ESLint rules to better detect unnecessary function wrappers. The custom rule now correctly identifies when `(x) => pipe(x, fn)` is redundant while allowing valid cases like `(x) => pipe(SomeService, fn)`. This improves code quality by preventing unnecessary indirection while preserving valid functional composition patterns.

- [#199](https://github.com/CodeForBreakfast/eventsourcing/pull/199) [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve code quality by using idiomatic Effect patterns

  The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.

- [#175](https://github.com/CodeForBreakfast/eventsourcing/pull/175) [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce simplified pipe usage patterns

  This update improves code maintainability and readability by enforcing consistent functional programming patterns. The codebase now exclusively uses the standalone `pipe()` function instead of method-based `.pipe()` calls, eliminates nested pipe compositions in favor of named helper functions, and removes curried function calls. These changes make the code easier to understand and debug while maintaining the same functionality.

- [#198](https://github.com/CodeForBreakfast/eventsourcing/pull/198) [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix all TypeScript code examples in documentation to pass validation. All examples now compile successfully with proper imports, type declarations, and adherence to functional programming patterns using pipe() composition.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

- [#196](https://github.com/CodeForBreakfast/eventsourcing/pull/196) [`d299e17`](https://github.com/CodeForBreakfast/eventsourcing/commit/d299e17bf5084b7785beca46d5b5b837a610792e) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix command initiator type handling. CommandContextService.getInitiator no longer wraps the initiator in Option - optionality is now controlled by the schema passed to CommandContext. Renamed CurrentUser to CommandContextError.

- [#159](https://github.com/CodeForBreakfast/eventsourcing/pull/159) [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes
  - Simplified lint task input patterns to prevent cache inconsistencies
  - Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
  - Added missing TSX test file patterns to ensure all test files are tracked
  - Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

  This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.

- [#169](https://github.com/CodeForBreakfast/eventsourcing/pull/169) [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720) Thanks [@GraemeF](https://github.com/GraemeF)! - Modernized service definitions to use Effect-TS 2.3+ patterns. Services now use `Context.Tag` instead of `Effect.Tag` with inlined service shapes, providing better type inference and cleaner code. Generic services use the `Context.GenericTag` factory pattern for proper type parameter support.

  For most users, these are internal improvements with no breaking changes. If you're directly referencing service types (like `CommandRegistryService`), use `Context.Tag.Service<typeof ServiceName>` to extract the service type instead.

- [#203](https://github.com/CodeForBreakfast/eventsourcing/pull/203) [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4) Thanks [@GraemeF](https://github.com/GraemeF)! - Code quality improvements: All packages now follow stricter functional programming patterns by removing type assertions in Effect callbacks. The codebase uses proper Schema validation and runtime type checking instead of unsafe type casts, improving type safety and code reliability.

- [#179](https://github.com/CodeForBreakfast/eventsourcing/pull/179) [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.

- [#173](https://github.com/CodeForBreakfast/eventsourcing/pull/173) [`5f5fff2`](https://github.com/CodeForBreakfast/eventsourcing/commit/5f5fff2cadd8109bf81adac0ab79e53cbeb8b7b2) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved readability of command processing by reducing nested pipe calls. The command processing factory now uses Effect.all to run independent effects in parallel with descriptive names, making the code flow clearer while maintaining identical behavior.

- [#194](https://github.com/CodeForBreakfast/eventsourcing/pull/194) [`433331d`](https://github.com/CodeForBreakfast/eventsourcing/commit/433331d25e58b347954aa73ff8836c74bbe73660) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce strict branded ID types throughout aggregate root operations. The `load()` and `commit()` functions now require explicitly typed aggregate IDs instead of accepting plain strings. Event metadata schema now correctly includes the `originator` field with proper type safety. This prevents accidental use of unvalidated string IDs and ensures compile-time enforcement of branded types like `UserId` or `OrderId` throughout the aggregate lifecycle.

- [#178](https://github.com/CodeForBreakfast/eventsourcing/pull/178) [`f4c06d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/f4c06d6430f61976ec9c28af38faac39f88800d1) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored pipe usage patterns to comply with simplified functional composition rules. All `pipe(fn(x), ...)` patterns have been converted to `pipe(x, fn, ...)` for better readability and consistency. This change also fixes Effect type signatures to properly use `never` instead of `unknown` in context parameters where appropriate.

- Updated dependencies [[`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222), [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf), [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43), [`4e9f8c9`](https://github.com/CodeForBreakfast/eventsourcing/commit/4e9f8c9711df00e01b0ab943dad67aa14d59df06), [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f), [`ae77963`](https://github.com/CodeForBreakfast/eventsourcing/commit/ae7796342df299997ece012b7090f1ce9190b0a4), [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a), [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe), [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b), [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.0
  - @codeforbreakfast/eventsourcing-store@0.8.0

## 0.6.5

### Patch Changes

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

- Updated dependencies [[`b1a2f97`](https://github.com/CodeForBreakfast/eventsourcing/commit/b1a2f9710bf40d879b1cbaa53ca001664d88f9df), [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-store@0.7.4
  - @codeforbreakfast/eventsourcing-commands@0.3.1

## 0.6.4

### Patch Changes

- Updated dependencies [[`f64ebb8`](https://github.com/CodeForBreakfast/eventsourcing/commit/f64ebb8a4e1f111e3e0f6bfed1be10c4e988436a)]:
  - @codeforbreakfast/eventsourcing-commands@0.3.0

## 0.6.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.3
  - @codeforbreakfast/eventsourcing-store@0.7.3

## 0.6.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.2
  - @codeforbreakfast/eventsourcing-store@0.7.2

## 0.6.1

### Patch Changes

- [#126](https://github.com/CodeForBreakfast/eventsourcing/pull/126) [`31dbe34`](https://github.com/CodeForBreakfast/eventsourcing/commit/31dbe348132aea1d65fa64493533a614a404bd25) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved development workflow with git worktree integration

  This change improves the development experience by implementing a git worktree-based workflow that provides better isolation between feature development and the main branch. The `/start` slash command now creates isolated worktrees for each feature, and the `/automerge` command properly cleans up worktrees after successful merges.

  Key benefits for developers:
  - Complete isolation of feature branches in separate working directories
  - Eliminates risk of contaminating main branch with uncommitted changes
  - Allows working on multiple features simultaneously
  - Each worktree maintains its own node_modules and mise configuration
  - Automatic mise trust and dependency installation in new worktrees

- [#129](https://github.com/CodeForBreakfast/eventsourcing/pull/129) [`565fff4`](https://github.com/CodeForBreakfast/eventsourcing/commit/565fff49f7e6878e8cb801bd2351a723bf2cc067) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve CI performance with enhanced Turbo cache strategy

  Enhanced the CI workflow to use a more intelligent cache strategy that enables better cache reuse across commits and between PR runs and main branch builds. CI builds now complete significantly faster when dependencies haven't changed.

  This is purely an internal development workflow improvement that does not affect the public API or runtime behavior of any packages.

- [#130](https://github.com/CodeForBreakfast/eventsourcing/pull/130) [`1ee3bf3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ee3bf3ad919580ae4e00edfc9defc5776f9b94e) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved CI/CD infrastructure with standardized mise-based tool management and optimized caching strategies for faster builds and more reliable deployments.

- [#128](https://github.com/CodeForBreakfast/eventsourcing/pull/128) [`5cac87e`](https://github.com/CodeForBreakfast/eventsourcing/commit/5cac87e9edf83c7b8fce8f1ba0c51d576ca92c6d) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve development workflow with enhanced validation scripts

  Enhanced the internal validation and release preparation scripts to use modern Turbo-based architecture. Package validation is now faster and more reliable thanks to improved caching and parallel execution. The validation process now properly separates discovery, orchestration, and execution concerns for better maintainability.

  Changes are purely internal to the development workflow and do not affect the public API or runtime behavior of any packages.

- Updated dependencies [[`31dbe34`](https://github.com/CodeForBreakfast/eventsourcing/commit/31dbe348132aea1d65fa64493533a614a404bd25), [`565fff4`](https://github.com/CodeForBreakfast/eventsourcing/commit/565fff49f7e6878e8cb801bd2351a723bf2cc067), [`1ee3bf3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ee3bf3ad919580ae4e00edfc9defc5776f9b94e), [`5cac87e`](https://github.com/CodeForBreakfast/eventsourcing/commit/5cac87e9edf83c7b8fce8f1ba0c51d576ca92c6d)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.1
  - @codeforbreakfast/eventsourcing-store@0.7.1

## 0.6.0

### Minor Changes

- [#92](https://github.com/CodeForBreakfast/eventsourcing/pull/92) [`a4f4377`](https://github.com/CodeForBreakfast/eventsourcing/commit/a4f4377d6641723ee40a1ca2a62b828c094f753f) Thanks [@GraemeF](https://github.com/GraemeF)! - Add Command Processing Service to bridge ServerProtocol and EventStore operations

  This release introduces the Command Processing Service, which provides the missing orchestration layer between server protocol commands and event store operations. This service enables automatic command handling, event storage, and proper error handling in event sourcing applications.

  **New exports:**
  - `CommandProcessingService` - Effect service tag for command processing
  - `CommandProcessingServiceInterface` - Service interface for command processing operations
  - `createCommandProcessingService` - Factory function to create service implementations
  - `CommandHandler` - Interface for individual command handlers
  - `CommandRouter` - Interface for routing commands to appropriate handlers
  - `CommandProcessingError` - Error type for general processing failures
  - `CommandRoutingError` - Error type for command routing failures

  **Key features:**
  - **Complete command flow**: Automatically processes commands from ServerProtocol through to EventStore storage
  - **Type-safe error handling**: Proper tagged errors with Effect error handling patterns
  - **Flexible routing**: Simple Map-based command routing to handlers
  - **Effect integration**: Seamless integration with EventStore and Effect ecosystem
  - **Testing support**: Comprehensive test coverage with real EventStore integration

  **Usage:**

  ```typescript
  import {
    CommandProcessingService,
    createCommandProcessingService,
    CommandRouter
  } from '@codeforbreakfast/eventsourcing-aggregates';

  // Create command router
  const router: CommandRouter = {
    route: (command) => // route to appropriate handler
  };

  // Create service layer
  const CommandProcessingServiceLive = Layer.effect(
    CommandProcessingService,
    createCommandProcessingService(router)
  );

  // Use in application
  const result = pipe(
    CommandProcessingService,
    Effect.flatMap(service => service.processCommand(command)),
    Effect.provide(CommandProcessingServiceLive)
  );
  ```

  This service completes the event sourcing architecture by connecting command handling to event storage with proper orchestration.

- [#85](https://github.com/CodeForBreakfast/eventsourcing/pull/85) [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a) Thanks [@GraemeF](https://github.com/GraemeF)! - Standardize API naming to follow Effect conventions

  Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.
  - Replace `create*` factory functions with `make*` (Effect convention)
  - Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
  - Remove backward compatibility aliases and redundant exports
  - Standardize all test interface methods to use Effect naming patterns

  This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.

### Patch Changes

- [#112](https://github.com/CodeForBreakfast/eventsourcing/pull/112) [`e0c59ca`](https://github.com/CodeForBreakfast/eventsourcing/commit/e0c59ca1ac5e235502d4efce137fda05ffe7418d) Thanks [@GraemeF](https://github.com/GraemeF)! - Implement immutable command registry with compile-time exhaustive command name validation. The new system provides complete type safety for command dispatch while maintaining clean API design.

  **Breaking Changes:**
  - Command registry is now immutable - all commands must be registered at construction time
  - Removed mutable `register()` methods in favor of declarative configuration
  - Updated error handling to use structured error types instead of strings

  **New Features:**
  - Exhaustive command name matching prevents dispatching unknown commands at compile time
  - Immutable command registry with zero runtime mutations
  - Type-safe command validation with Effect Schema integration
  - Comprehensive command result types with detailed error information

  **Developer Experience:**
  - Clean, minimal API focused on behavior over type demonstrations
  - Compile-time guarantees for command name validity
  - Automatic type inference for command payloads and handlers
  - Simplified test suite focused on actual functionality

- [#103](https://github.com/CodeForBreakfast/eventsourcing/pull/103) [`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e) Thanks [@GraemeF](https://github.com/GraemeF)! - Separate CQRS command types into dedicated package for better architecture

  **New Package: `@codeforbreakfast/eventsourcing-commands`**
  - Introduces a dedicated package for CQRS command types and schemas
  - Contains `Command` and `CommandResult` schemas that were previously in the store package
  - Establishes proper separation between domain concepts (commands) and event storage
  - Includes comprehensive test coverage and documentation

  **Breaking changes for `@codeforbreakfast/eventsourcing-store`:**
  - Removed `Command` and `CommandResult` types - these are now in the commands package
  - Store package now focuses purely on event streaming and storage concepts
  - Updated description to reflect pure event streaming focus

  **Updated packages:**
  - `@codeforbreakfast/eventsourcing-aggregates`: Updated to import command types from commands package
  - `@codeforbreakfast/eventsourcing-protocol-default`: Updated to import command types from commands package

  This change establishes cleaner architectural boundaries:
  - **Store**: Pure event streaming and storage
  - **Commands**: CQRS command types and schemas
  - **Aggregates**: Domain modeling (uses both events and commands)
  - **Protocol**: Transport implementation (uses both events and commands)

- [#102](https://github.com/CodeForBreakfast/eventsourcing/pull/102) [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve package architecture and domain type organization

  **Breaking changes for `@codeforbreakfast/eventsourcing-store`:**
  - Added new domain types `Command`, `Event`, and `CommandResult` schemas that were previously only available in the protocol package
  - These core domain types are now available directly from the store package for better separation of concerns

  **Improvements for `@codeforbreakfast/eventsourcing-aggregates`:**
  - Fixed architectural violation by removing dependency on protocol implementation
  - Aggregate roots now only depend on store abstractions, creating cleaner layer separation
  - Import domain types directly from store package instead of protocol package

  **Improvements for `@codeforbreakfast/eventsourcing-protocol`:**
  - Domain types (`Command`, `Event`, `CommandResult`) are now imported from store package and re-exported for convenience
  - Maintains backward compatibility while improving architectural boundaries

  This change establishes cleaner separation between domain concepts (in store) and transport protocols, making the packages more modular and easier to understand.

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#120](https://github.com/CodeForBreakfast/eventsourcing/pull/120) [`1ab2f4e`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ab2f4e3f6f3ff19eb6a52ed6a1095dd94209247) Thanks [@GraemeF](https://github.com/GraemeF)! - Export InMemoryStore as namespace following Effect patterns

  **BREAKING CHANGE**: InMemoryStore is now exported as a namespace module instead of individual exports.

  Before:

  ```typescript
  import { make } from '@codeforbreakfast/eventsourcing-store-inmemory';
  const store = await make();
  ```

  After:

  ```typescript
  import { InMemoryStore } from '@codeforbreakfast/eventsourcing-store-inmemory';
  const store = await InMemoryStore.make();
  ```

  This change aligns with Effect library conventions where modules like Queue, Ref, etc. are exported as namespaces containing their functions.

- [#95](https://github.com/CodeForBreakfast/eventsourcing/pull/95) [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor existing tests to use @codeforbreakfast/buntest package

  This change improves the testing experience by:
  - Converting manual Effect.runPromise calls to Effect-aware test runners (it.effect, it.live, it.scoped)
  - Adding proper scoped resource management for transport lifecycle tests
  - Using Effect-specific assertions and custom equality matchers for Effect types
  - Leveraging automatic TestServices provision (TestClock, etc.) in effect tests
  - Implementing cleaner layer sharing patterns where appropriate
  - Reducing test boilerplate and improving readability

  All existing tests continue to pass while providing a better developer experience for Effect-based testing.

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- Updated dependencies [[`e0c59ca`](https://github.com/CodeForBreakfast/eventsourcing/commit/e0c59ca1ac5e235502d4efce137fda05ffe7418d), [`a7f5b72`](https://github.com/CodeForBreakfast/eventsourcing/commit/a7f5b72bc6379c7a864ba8b5d1fcc578970c3fd6), [`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.0
  - @codeforbreakfast/eventsourcing-store@0.7.0

## 0.5.7

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

- Updated dependencies [[`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa), [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa)]:
  - @codeforbreakfast/eventsourcing-store@0.6.7

## 0.5.6

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

- Updated dependencies [[`7cec47a`](https://github.com/CodeForBreakfast/eventsourcing/commit/7cec47a3cf6741febd99f96dec4cadb1923543c2), [`ff5231c`](https://github.com/CodeForBreakfast/eventsourcing/commit/ff5231c27122a47839b3aedf162c00f30f5e3257)]:
  - @codeforbreakfast/eventsourcing-store@0.6.6

## 0.5.5

### Patch Changes

- Updated dependencies [[`ecd91f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/ecd91f3a05de08f82752ddf8f6f5c6d5238cec78)]:
  - @codeforbreakfast/eventsourcing-store@0.6.5

## 0.5.4

### Patch Changes

- [#60](https://github.com/CodeForBreakfast/eventsourcing/pull/60) [`e61e1da`](https://github.com/CodeForBreakfast/eventsourcing/commit/e61e1da32d2fecafc0e6e638cb0ca0daa49fada7) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix prepublishOnly script to maintain build dependency chain

  The prepublishOnly script was doing a clean build (`clean && build`) which broke the dependency chain established by Turbo's build ordering. This caused packages that depend on other workspace packages to fail TypeScript compilation during publishing because their dependencies' TypeScript definitions weren't available.

  Changed prepublishOnly from `bun run clean && bun run build` to just `bun run build` to maintain the build artifacts and dependency chain established by the main build process.

- Updated dependencies [[`e61e1da`](https://github.com/CodeForBreakfast/eventsourcing/commit/e61e1da32d2fecafc0e6e638cb0ca0daa49fada7)]:
  - @codeforbreakfast/eventsourcing-store@0.6.4

## 0.5.3

### Patch Changes

- [#58](https://github.com/CodeForBreakfast/eventsourcing/pull/58) [`b391253`](https://github.com/CodeForBreakfast/eventsourcing/commit/b391253c9b298de5d8712b147a4bfefff4295a90) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix TypeScript definition generation in build process

  The build process was not properly generating TypeScript definition files for published packages due to incremental compilation cache issues. This fix adds the `--force` flag to the TypeScript compiler to ensure definition files are always generated during the build process.

  This resolves issues where consumers of these packages would not have proper TypeScript intellisense and type checking.

- Updated dependencies [[`b391253`](https://github.com/CodeForBreakfast/eventsourcing/commit/b391253c9b298de5d8712b147a4bfefff4295a90)]:
  - @codeforbreakfast/eventsourcing-store@0.6.3

## 0.5.2

### Patch Changes

- [#57](https://github.com/CodeForBreakfast/eventsourcing/pull/57) [`10bc57b`](https://github.com/CodeForBreakfast/eventsourcing/commit/10bc57b88b396f9536d0ec3afa670f41991b181c) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix workspace protocol dependencies in published packages

  The published packages incorrectly included `workspace:*` protocol in their dependencies, making them impossible to install outside the monorepo. This was caused by changesets not supporting Bun's workspace protocol.

  The fix updates the release workflow to:
  1. Run `bun update` after versioning to resolve workspace references
  2. Use `bun publish` directly instead of `changeset publish`
  3. Run `changeset tag` to create git tags after publishing

  This ensures published packages have proper version constraints instead of workspace protocols.

- [#55](https://github.com/CodeForBreakfast/eventsourcing/pull/55) [`527cedc`](https://github.com/CodeForBreakfast/eventsourcing/commit/527cedca43b67ab4c32d330b5e2bca8acf90574b) Thanks [@GraemeF](https://github.com/GraemeF)! - Test patch release to verify changeset publish handles workspace protocol correctly

  This patch verifies that the changeset publish process properly replaces workspace:\* with actual version numbers when publishing to npm.

- Updated dependencies [[`10bc57b`](https://github.com/CodeForBreakfast/eventsourcing/commit/10bc57b88b396f9536d0ec3afa670f41991b181c)]:
  - @codeforbreakfast/eventsourcing-store@0.6.2

## 0.5.1

### Patch Changes

- Fix workspace protocol dependencies in published packages

  The published packages incorrectly included workspace:\* protocol in their dependencies, making them impossible to install outside the monorepo. This patch ensures proper version numbers are used in published packages.

- Updated dependencies []:
  - @codeforbreakfast/eventsourcing-store@0.6.1

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

### Patch Changes

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

- [#47](https://github.com/CodeForBreakfast/eventsourcing/pull/47) [`73ca9d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/73ca9d44adca717e75edc04b6dd6d02fdd8afbf1) Thanks [@GraemeF](https://github.com/GraemeF)! - Update to work with simplified EventStore API
  - Updated to use `read()` instead of `readHistorical()` for loading aggregate state
  - Projections package now correctly maps legacy `readHistorical` calls to new `read()` method
  - Both packages maintain backward compatibility while using the new simplified API internally

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

### Patch Changes

- Updated dependencies [[`d791f62`](https://github.com/CodeForBreakfast/eventsourcing/commit/d791f621433a491bcd4251ba0c7bdc53d1c66139)]:
  - @codeforbreakfast/eventsourcing-store@0.2.0
  - @codeforbreakfast/eventsourcing-projections@0.2.0
