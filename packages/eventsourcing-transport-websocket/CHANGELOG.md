# @codeforbreakfast/eventsourcing-transport-websocket

## 0.5.5

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor test code to follow proper functional programming patterns

  This is an internal refactoring of test code to eliminate ESLint rule violations by following proper Effect functional programming patterns. No public API changes.

## 0.5.4

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

## 0.5.3

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.7

## 0.5.2

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.6

## 0.5.1

### Patch Changes

- [#262](https://github.com/CodeForBreakfast/eventsourcing/pull/262) [`b772d4d`](https://github.com/CodeForBreakfast/eventsourcing/commit/b772d4d8dbf905b2e88c17ff9793162318370687) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix TypeScript type errors in WebSocket server upgrade calls.

  Made `clientId` optional in `WebSocketData` interface since it's assigned after the WebSocket connection is established in the `open` handler, not during the `upgrade()` call. Added guard clauses in `message` and `close` handlers to ensure `clientId` is defined before use.

  This resolves type errors that surfaced with stricter Bun type definitions while maintaining type safety.

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

## 0.5.0

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

## 0.4.3

### Patch Changes

- [#225](https://github.com/CodeForBreakfast/eventsourcing/pull/225) [`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored test utilities to use Effect.sleep instead of setTimeout for more consistent and testable async behavior. This change only affects test code and does not impact public APIs.

## 0.4.2

### Patch Changes

- [#161](https://github.com/CodeForBreakfast/eventsourcing/pull/161) [`4419aac`](https://github.com/CodeForBreakfast/eventsourcing/commit/4419aaccb59f4e4f85695764ef6df81c6da69fce) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove blanket eslint-disable and fix functional programming violations

  Replaced file-wide eslint-disable comments with properly typed code that satisfies functional programming rules. The mock WebSocket implementation in tests now uses immutable patterns where possible while maintaining necessary test functionality.

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

- [#164](https://github.com/CodeForBreakfast/eventsourcing/pull/164) [`96c7eb3`](https://github.com/CodeForBreakfast/eventsourcing/commit/96c7eb357abb7a36bc45a007bd58ec6e594f7abb) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality by configuring ESLint to recognize Effect types as immutable-by-contract and removing unnecessary ESLint suppressions. This change has no runtime impact but improves code maintainability.

  **WebSocket Transport**: Fixed mutation anti-patterns by replacing type-cast mutations with proper Effect immutable data structures (HashMap, HashSet, Ref). All 21 ESLint suppressions across websocket transport files have been removed.

  **Protocol**: Removed 15 unnecessary ESLint suppressions that are no longer needed with the improved ESLint configuration.

  **ESLint Configuration**: Configured functional programming rules to understand that Effect types (Ref, Queue, HashMap, HashSet, Stream, PubSub) are immutable-by-contract despite containing internal mutable state managed through controlled APIs.

- [#199](https://github.com/CodeForBreakfast/eventsourcing/pull/199) [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve code quality by using idiomatic Effect patterns

  The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.

- [#175](https://github.com/CodeForBreakfast/eventsourcing/pull/175) [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce simplified pipe usage patterns

  This update improves code maintainability and readability by enforcing consistent functional programming patterns. The codebase now exclusively uses the standalone `pipe()` function instead of method-based `.pipe()` calls, eliminates nested pipe compositions in favor of named helper functions, and removes curried function calls. These changes make the code easier to understand and debug while maintaining the same functionality.

- [#198](https://github.com/CodeForBreakfast/eventsourcing/pull/198) [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix all TypeScript code examples in documentation to pass validation. All examples now compile successfully with proper imports, type declarations, and adherence to functional programming patterns using pipe() composition.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

- [#159](https://github.com/CodeForBreakfast/eventsourcing/pull/159) [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes
  - Simplified lint task input patterns to prevent cache inconsistencies
  - Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
  - Added missing TSX test file patterns to ensure all test files are tracked
  - Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

  This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.

- [#172](https://github.com/CodeForBreakfast/eventsourcing/pull/172) [`feaa07d`](https://github.com/CodeForBreakfast/eventsourcing/commit/feaa07df4f4d99bf0b69113e6c1758880727e18b) Thanks [@GraemeF](https://github.com/GraemeF)! - Internal refactoring to use immutable collections from Effect

  Replaced mutable data structures with Effect's immutable HashSet and Chunk collections for better functional programming practices. This is an internal implementation change with no impact on the public API or behavior.

- [#169](https://github.com/CodeForBreakfast/eventsourcing/pull/169) [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720) Thanks [@GraemeF](https://github.com/GraemeF)! - Modernized service definitions to use Effect-TS 2.3+ patterns. Services now use `Context.Tag` instead of `Effect.Tag` with inlined service shapes, providing better type inference and cleaner code. Generic services use the `Context.GenericTag` factory pattern for proper type parameter support.

  For most users, these are internal improvements with no breaking changes. If you're directly referencing service types (like `CommandRegistryService`), use `Context.Tag.Service<typeof ServiceName>` to extract the service type instead.

- [#203](https://github.com/CodeForBreakfast/eventsourcing/pull/203) [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4) Thanks [@GraemeF](https://github.com/GraemeF)! - Code quality improvements: All packages now follow stricter functional programming patterns by removing type assertions in Effect callbacks. The codebase uses proper Schema validation and runtime type checking instead of unsafe type casts, improving type safety and code reliability.

- [#179](https://github.com/CodeForBreakfast/eventsourcing/pull/179) [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.

- [#180](https://github.com/CodeForBreakfast/eventsourcing/pull/180) [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce documented justifications for all ESLint rule suppressions

  All `eslint-disable` comments now require a description explaining why the rule is being suppressed. This improves code maintainability by documenting the reasoning behind each exception to the linting rules.

- Updated dependencies [[`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.5

## 0.4.1

### Patch Changes

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

- Updated dependencies [[`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.4

## 0.4.0

### Minor Changes

- [#143](https://github.com/CodeForBreakfast/eventsourcing/pull/143) [`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored WebSocket transport to use @effect/platform/Socket abstraction

  **Breaking Changes:**
  - The WebSocket transport now uses the @effect/platform/Socket module instead of raw WebSocket API
  - Connection error handling has been improved with better Effect-based lifecycle management
  - The transport now properly manages resources using Effect's Scope

  **Benefits:**
  - Better integration with Effect ecosystem
  - Improved error handling and resource cleanup
  - Proper structured concurrency for WebSocket connections
  - More robust connection state management

  **Migration:**
  No changes required for consumers - the public API remains the same. The transport continues to implement the standard Client.Transport interface.

### Patch Changes

- [#143](https://github.com/CodeForBreakfast/eventsourcing/pull/143) [`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7) Thanks [@GraemeF](https://github.com/GraemeF)! - Moved misplaced changeset from package directory to proper .changeset location and enhanced validation to catch invalid package references

## 0.3.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.3

## 0.3.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.2

## 0.3.1

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
  - @codeforbreakfast/eventsourcing-transport@0.3.1

## 0.3.0

### Minor Changes

- [#85](https://github.com/CodeForBreakfast/eventsourcing/pull/85) [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a) Thanks [@GraemeF](https://github.com/GraemeF)! - Standardize API naming to follow Effect conventions

  Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.
  - Replace `create*` factory functions with `make*` (Effect convention)
  - Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
  - Remove backward compatibility aliases and redundant exports
  - Standardize all test interface methods to use Effect naming patterns

  This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.

- [#106](https://github.com/CodeForBreakfast/eventsourcing/pull/106) [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511) Thanks [@GraemeF](https://github.com/GraemeF)! - **BREAKING CHANGE**: Rename package from `@codeforbreakfast/eventsourcing-transport-contracts` to `@codeforbreakfast/eventsourcing-transport`

  The transport contracts package has been renamed to better reflect its role as the core transport abstraction layer. No API changes - only the package name has changed.

### Patch Changes

- [#121](https://github.com/CodeForBreakfast/eventsourcing/pull/121) [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce functional programming patterns with stricter ESLint rules

  ## Changes
  - **Classes are now forbidden** except for Effect library patterns (Data.TaggedError, Effect.Tag, Context.Tag, Context.GenericTag, Schema.Class)
  - **Effect.gen is now forbidden** - all code must use pipe-based composition with Effect.all and Effect.forEach
  - Fixed test code to comply with functional programming patterns by replacing classes with factory functions
  - Refactored Effect.gen usage to pipe-based functional composition

  These changes enforce a more consistent functional programming style across the codebase, improving maintainability and reducing cognitive overhead when working with Effect.

- [#117](https://github.com/CodeForBreakfast/eventsourcing/pull/117) [`1d595d3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1d595d35b03f20e4a26fa712d30c22b66354519b) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix WebSocket disconnection detection when server closes

  Improved handling of server-initiated disconnections in WebSocket transport. Clients now properly receive 'disconnected' state notifications when the server shuts down. This ensures applications can detect and respond to connection loss appropriately.

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#95](https://github.com/CodeForBreakfast/eventsourcing/pull/95) [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor existing tests to use @codeforbreakfast/buntest package

  This change improves the testing experience by:
  - Converting manual Effect.runPromise calls to Effect-aware test runners (it.effect, it.live, it.scoped)
  - Adding proper scoped resource management for transport lifecycle tests
  - Using Effect-specific assertions and custom equality matchers for Effect types
  - Leveraging automatic TestServices provision (TestClock, etc.) in effect tests
  - Implementing cleaner layer sharing patterns where appropriate
  - Reducing test boilerplate and improving readability

  All existing tests continue to pass while providing a better developer experience for Effect-based testing.

- [#87](https://github.com/CodeForBreakfast/eventsourcing/pull/87) [`51ee12c`](https://github.com/CodeForBreakfast/eventsourcing/commit/51ee12c86ab9ccf3b127408ee6298332be38554a) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove unimplemented WebSocket configuration options and update documentation

  **Breaking Changes for @codeforbreakfast/eventsourcing-websocket:**
  - Removed unused `DefaultWebSocketConfig` export
  - Removed unused `WebSocketConnectOptions` interface
  - Removed unused `WebSocketEventSourcingInfo` export
  - Simplified `connect()` function to only accept URL parameter

  **Improvements:**
  - Updated README to reflect actual implementation status rather than aspirational roadmap
  - Removed misleading "TDD placeholder" comment from WebSocket server implementation
  - Cleaned up test files to remove references to deleted configuration options

  These configuration options were never actually used by the implementation and provided no functionality. The WebSocket packages are fully implemented and ready for use.

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#122](https://github.com/CodeForBreakfast/eventsourcing/pull/122) [`9c2d879`](https://github.com/CodeForBreakfast/eventsourcing/commit/9c2d8795116855ac38b0f294c1ed1416dd03b7c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Reorganized transport tests to eliminate duplication and improve maintainability. Tests are now properly organized across separate directories for better clarity and reuse of common patterns.

- [#114](https://github.com/CodeForBreakfast/eventsourcing/pull/114) [`809c63f`](https://github.com/CodeForBreakfast/eventsourcing/commit/809c63ff3ba63abb3f52e49c965bb9a517bdde14) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved WebSocket transport testing approach
  - Removed problematic global state mocking that violated test isolation
  - Documented testing options including @effect/platform/Socket for future improvements
  - Simplified test suite to focus on testable scenarios without mocking
  - Integration tests continue to provide coverage for main functionality

- [#118](https://github.com/CodeForBreakfast/eventsourcing/pull/118) [`3b1a210`](https://github.com/CodeForBreakfast/eventsourcing/commit/3b1a210ab0c8a730cc0b950ea5a1893e7a55dfa1) Thanks [@GraemeF](https://github.com/GraemeF)! - Add comprehensive test coverage for WebSocket transport
  - Added unit tests for connection lifecycle including state transitions and delayed connections
  - Added tests for error scenarios including connection failures, timeouts, and connection refused
  - Added tests for message handling including delivery, malformed JSON filtering, and subscription filters
  - Added tests for publishing constraints when connected or disconnected
  - Implemented mock WebSocket for deterministic testing without real network connections

- Updated dependencies [[`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.0

## 0.2.2

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
  - @codeforbreakfast/eventsourcing-transport@0.2.2

## 0.2.1

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
  - @codeforbreakfast/eventsourcing-transport@0.2.1

## 0.2.0

### Minor Changes

- [#67](https://github.com/CodeForBreakfast/eventsourcing/pull/67) [`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5) Thanks [@GraemeF](https://github.com/GraemeF)! - Complete refactor of transport layer with proper layered architecture

  ### Transport & Protocol Improvements
  - **New simplified transport contracts** - Minimal Client/Server namespaces with clean separation of concerns
  - **Protocol layer separation** - Clear boundary between data transport and business logic
  - **Functional Effect-based design** - Replaced 3900+ lines of OOP with functional primitives
  - **Zero global state** - All state properly managed through Effect refs

  ### New Packages
  - `@codeforbreakfast/eventsourcing-protocol-default` - Simplified protocol implementation with client/server logic
  - `@codeforbreakfast/eventsourcing-testing-contracts` - Reusable contract tests for transport implementations

  ### Breaking Changes
  - Removed `eventsourcing-protocol-contracts` package (merged into protocol-default)
  - WebSocket transport completely rewritten with new API
  - Transport implementations now use Effect.Tag pattern consistently

  ### Testing Improvements
  - 2000+ lines of comprehensive protocol tests
  - Contract-based testing for all transport implementations
  - Type-safe schema validation throughout

  ### Developer Experience
  - Added `bun run ci` command for local CI validation
  - Simplified API surface with better type inference
  - Consistent error handling across all packages

### Patch Changes

- Updated dependencies [[`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5)]:
  - @codeforbreakfast/eventsourcing-transport@0.2.0
