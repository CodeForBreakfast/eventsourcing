# @codeforbreakfast/eventsourcing-store

## 0.8.5

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

## 0.8.4

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

## 0.8.3

### Patch Changes

- [#259](https://github.com/CodeForBreakfast/eventsourcing/pull/259) [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add Effect-native assertions and new ESLint rules

  **New Features:**
  - **buntest**: Added Effect-native assertion utilities (`expectEffect`, `toSucceedWith`, `toFailWith`) and a new ESLint rule `prefer-effect-assertions` to enforce their usage
  - **eslint-effect**: Added two new rules: `no-effect-if-option-check` and `prefer-get-or-undefined`

  **Bug Fixes & Improvements:**
  - Replaced `Effect.sync(expect())` patterns with Effect-native assertions across test suites
  - Removed unnecessary function aliases to improve code readability
  - Fixed nested pipe calls and redundant Effect.sync wrappers

## 0.8.2

### Patch Changes

- [#225](https://github.com/CodeForBreakfast/eventsourcing/pull/225) [`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored test utilities to use Effect.sleep instead of setTimeout for more consistent and testable async behavior. This change only affects test code and does not impact public APIs.

## 0.8.1

### Patch Changes

- [#211](https://github.com/CodeForBreakfast/eventsourcing/pull/211) [`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve nested pipe detection and add test enforcement rules

  **Breaking behavior change in `no-nested-pipes` rule (formerly `no-multiple-pipes`):**

  The rule now only flags truly nested pipe calls (where one pipe is used as an argument to another pipe), instead of flagging any function with multiple sequential pipe calls.

  **Before:**

  ```typescript
  // This was incorrectly flagged as an error
  const result1 = pipe(42, (x) => x + 1);
  const result2 = pipe(result1, (x) => x * 2); // ❌ Error
  ```

  **After:**

  ```typescript
  // Multiple sequential pipes are now allowed
  const result1 = pipe(42, (x) => x + 1);
  const result2 = pipe(result1, (x) => x * 2); // ✅ OK

  // Only nested pipes are flagged
  const bad = pipe(
    pipe(42, (x) => x + 1), // ❌ Error - nested pipe
    (x) => x * 2
  );
  ```

  **New buntest rules:**
  - `buntest/no-runPromise-in-tests` - Enforces using `it.effect()` instead of `Effect.runPromise()` in test files for better error handling and test isolation

  **Migration guide:**

  If you were relying on the old `no-multiple-pipes` behavior, you'll need to update your ESLint config to use the new rule name `no-nested-pipes`. The rule is less strict now and only catches genuinely problematic nested pipe patterns.

## 0.8.0

### Minor Changes

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

- [#171](https://github.com/CodeForBreakfast/eventsourcing/pull/171) [`ae77963`](https://github.com/CodeForBreakfast/eventsourcing/commit/ae7796342df299997ece012b7090f1ce9190b0a4) Thanks [@GraemeF](https://github.com/GraemeF)! - **BREAKING CHANGE**: Remove factory functions with default type parameters to enforce explicit type specification

  Factory functions that previously allowed default `unknown` type parameters have been removed. You must now create service tags directly using `Context.GenericTag` with explicit types.

  **Migration guide:**

  Before:

  ```typescript
  const EventStoreService = EventStore<UserEvent>();
  const ProjectionStoreService = ProjectionStore<UserProjection>();
  ```

  After:

  ```typescript
  const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
    'UserEventStore'
  );
  const UserProjectionStore = Context.GenericTag<
    ProjectionStore<UserProjection>,
    ProjectionStore<UserProjection>
  >('UserProjectionStore');
  ```

  This change enforces domain-specific types throughout your codebase, preventing accidental use of `unknown` types in domain code while keeping generic types only at serialization boundaries.

  **What's changed:**
  - Removed `EventStore()`, `ProjectionStore()`, and `SnapshotStore()` factory functions
  - Removed `StreamHandler()` and `StreamHandlerLive()` factory functions
  - Removed default type parameter from `DomainCommand<TPayload>` interface
  - Updated documentation to reflect the new pattern

### Patch Changes

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

- [#167](https://github.com/CodeForBreakfast/eventsourcing/pull/167) [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated type-fest dependency to v5 and removed unused ESLint directives. No functional changes to the API.

- [#200](https://github.com/CodeForBreakfast/eventsourcing/pull/200) [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43) Thanks [@GraemeF](https://github.com/GraemeF)! - Enhanced ESLint rules to better detect unnecessary function wrappers. The custom rule now correctly identifies when `(x) => pipe(x, fn)` is redundant while allowing valid cases like `(x) => pipe(SomeService, fn)`. This improves code quality by preventing unnecessary indirection while preserving valid functional composition patterns.

- [#199](https://github.com/CodeForBreakfast/eventsourcing/pull/199) [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve code quality by using idiomatic Effect patterns

  The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.

- [#175](https://github.com/CodeForBreakfast/eventsourcing/pull/175) [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce simplified pipe usage patterns

  This update improves code maintainability and readability by enforcing consistent functional programming patterns. The codebase now exclusively uses the standalone `pipe()` function instead of method-based `.pipe()` calls, eliminates nested pipe compositions in favor of named helper functions, and removes curried function calls. These changes make the code easier to understand and debug while maintaining the same functionality.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

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

- [#180](https://github.com/CodeForBreakfast/eventsourcing/pull/180) [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce documented justifications for all ESLint rule suppressions

  All `eslint-disable` comments now require a description explaining why the rule is being suppressed. This improves code maintainability by documenting the reasoning behind each exception to the linting rules.

## 0.7.4

### Patch Changes

- [#153](https://github.com/CodeForBreakfast/eventsourcing/pull/153) [`b1a2f97`](https://github.com/CodeForBreakfast/eventsourcing/commit/b1a2f9710bf40d879b1cbaa53ca001664d88f9df) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplified type definitions while strengthening type safety:
  - Error classes no longer expose redundant static `is` methods - use built-in tag discrimination instead
  - Improved type guard implementation using Effect's discriminated union pattern
  - Test service definitions now use proper service interfaces instead of bare string literals

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

## 0.7.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

## 0.7.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

## 0.7.1

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

## 0.7.0

### Minor Changes

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

- [#85](https://github.com/CodeForBreakfast/eventsourcing/pull/85) [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a) Thanks [@GraemeF](https://github.com/GraemeF)! - Standardize API naming to follow Effect conventions

  Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.
  - Replace `create*` factory functions with `make*` (Effect convention)
  - Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
  - Remove backward compatibility aliases and redundant exports
  - Standardize all test interface methods to use Effect naming patterns

  This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.

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

- [#105](https://github.com/CodeForBreakfast/eventsourcing/pull/105) [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1) Thanks [@GraemeF](https://github.com/GraemeF)! - Extract in-memory EventStore implementation into separate package

  The in-memory EventStore implementation has been moved from `@codeforbreakfast/eventsourcing-store` to its own dedicated `@codeforbreakfast/eventsourcing-store-inmemory` package for better architectural separation.

  **Benefits:**
  - **Cleaner Architecture**: Core package contains only abstractions and interfaces
  - **Better Modularity**: In-memory implementation is self-contained with its own documentation
  - **Improved Separation**: Clear boundaries between core types and specific implementations
  - **Enhanced Maintainability**: Each package has focused responsibilities

### Patch Changes

- [#121](https://github.com/CodeForBreakfast/eventsourcing/pull/121) [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce functional programming patterns with stricter ESLint rules

  ## Changes
  - **Classes are now forbidden** except for Effect library patterns (Data.TaggedError, Effect.Tag, Context.Tag, Context.GenericTag, Schema.Class)
  - **Effect.gen is now forbidden** - all code must use pipe-based composition with Effect.all and Effect.forEach
  - Fixed test code to comply with functional programming patterns by replacing classes with factory functions
  - Refactored Effect.gen usage to pipe-based functional composition

  These changes enforce a more consistent functional programming style across the codebase, improving maintainability and reducing cognitive overhead when working with Effect.

- [#125](https://github.com/CodeForBreakfast/eventsourcing/pull/125) [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6) Thanks [@GraemeF](https://github.com/GraemeF)! - Ensure pre-1.0 packages use minor version bumps instead of major

  Updated changeset configurations to use minor version bumps as the maximum for all pre-1.0 packages, following semantic versioning best practices for pre-release versions. This ensures breaking changes are communicated through minor version increments rather than major version bumps while packages are still in initial development.

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

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#96](https://github.com/CodeForBreakfast/eventsourcing/pull/96) [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce) Thanks [@GraemeF](https://github.com/GraemeF)! - Configure logger to be silent during tests to reduce output noise

  Reduces test output verbosity by configuring the Effect logger to be silent during test runs. This change:
  - Adds a `silentLogger` export to `@codeforbreakfast/buntest` for consistent test logger configuration
  - Replaces verbose logger configurations in test files with the shared silent logger
  - Eliminates noisy INFO and ERROR logs during test execution while preserving actual test results
  - Improves developer experience by making test output cleaner and more readable

  Users will see significantly less log output when running tests, making it easier to focus on test results and failures.

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
