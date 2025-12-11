# @codeforbreakfast/eventsourcing-store-postgres

## 0.6.14

### Patch Changes

- [#360](https://github.com/CodeForBreakfast/eventsourcing/pull/360) [`524e2b3`](https://github.com/CodeForBreakfast/eventsourcing/commit/524e2b36befc0239d661f60ae7b92f3f47f761ee) Thanks [@renovate](https://github.com/apps/renovate)! - Update Effect ecosystem dependencies to latest versions:
  - effect: 3.18.4 -> 3.19.9
  - @effect/platform: 0.92.1 -> 0.93.6
  - @effect/platform-bun: 0.81.1 -> 0.86.0
  - @effect/sql: 0.46.0 -> 0.48.6
  - @effect/sql-pg: 0.47.0 -> 0.49.7
  - @effect/cli: 0.71.0 -> 0.72.1
  - @effect/experimental: 0.56.0 -> 0.57.11

  Added new peer dependencies required by @effect/platform-bun:
  - @effect/cluster: 0.55.0
  - @effect/rpc: 0.72.2
  - @effect/workflow: 0.15.0

- Updated dependencies [[`524e2b3`](https://github.com/CodeForBreakfast/eventsourcing/commit/524e2b36befc0239d661f60ae7b92f3f47f761ee)]:
  - @codeforbreakfast/eventsourcing-store@0.9.3

## 0.6.13

### Patch Changes

- [#381](https://github.com/CodeForBreakfast/eventsourcing/pull/381) [`9849132`](https://github.com/CodeForBreakfast/eventsourcing/commit/9849132e78732f795aa15d3d8053baae92e97d0b) Thanks [@GraemeF](https://github.com/GraemeF)! - Rename package from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect` and prepare for public npm release.

  **Migration:** Update your imports from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect`.

  This release makes the package publicly available on npm with:
  - Effect-aware test runners (`it.effect`, `it.scoped`, `it.live`, `it.scopedLive`)
  - Layer sharing across tests with `it.layer()`
  - Effect-native assertions (`expectSome`, `expectNone`, `expectRight`, `expectLeft`, `assertEqual`)
  - ESLint rules for Effect testing best practices
  - Silent logger utility for suppressing test output

- Updated dependencies [[`9849132`](https://github.com/CodeForBreakfast/eventsourcing/commit/9849132e78732f795aa15d3d8053baae92e97d0b)]:
  - @codeforbreakfast/eventsourcing-store@0.9.2

## 0.6.12

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor test code to follow proper functional programming patterns

  This is an internal refactoring of test code to eliminate ESLint rule violations by following proper Effect functional programming patterns. No public API changes.

- Updated dependencies [[`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4)]:
  - @codeforbreakfast/eventsourcing-store@0.9.1

## 0.6.11

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

- [#330](https://github.com/CodeForBreakfast/eventsourcing/pull/330) [`0ebafcc`](https://github.com/CodeForBreakfast/eventsourcing/commit/0ebafcc3fea21500e54475df7114a78d9e96be7a) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor to use `EventStreamPosition` type throughout the codebase instead of separate `streamId` and `eventNumber` parameters. This change improves type safety and API consistency by consolidating stream position information into a single, well-defined type.

  **Breaking changes:**
  - `EventStreamTracker.processEvent` now accepts `position: EventStreamPosition` instead of separate `streamId` and `eventNumber` parameters
  - `SubscriptionManagerService.publishToAllEvents` now accepts `position: EventStreamPosition` instead of separate `streamId` and `eventNumber` parameters
  - Internal subscription types now use `{ position: EventStreamPosition; event: string }` instead of `{ streamId: EventStreamId; eventNumber: number; event: string }`

  **Migration guide:**
  Replace separate streamId/eventNumber parameters with EventStreamPosition:

  ```typescript
  // Before
  tracker.processEvent(streamId, eventNumber, event);
  subscriptionManager.publishToAllEvents(streamId, eventNumber, event);

  // After
  tracker.processEvent({ streamId, eventNumber }, event);
  subscriptionManager.publishToAllEvents({ streamId, eventNumber }, event);
  ```

- [#323](https://github.com/CodeForBreakfast/eventsourcing/pull/323) [`654e7b3`](https://github.com/CodeForBreakfast/eventsourcing/commit/654e7b39585dd5c8c10d3fe9cffd675cddf3c039) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved documentation and test maintainability. Updated README examples to include subscribeAll() method, and refactored integration tests to eliminate deeply nested code structure.

- Updated dependencies [[`e177936`](https://github.com/CodeForBreakfast/eventsourcing/commit/e177936ba898dcf8dfdaabbf413cd483cd5b90b7)]:
  - @codeforbreakfast/eventsourcing-store@0.9.0

## 0.6.10

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-store@0.8.5

## 0.6.9

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-store@0.8.4

## 0.6.8

### Patch Changes

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

- Updated dependencies [[`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2)]:
  - @codeforbreakfast/eventsourcing-store@0.8.3

## 0.6.7

### Patch Changes

- [#228](https://github.com/CodeForBreakfast/eventsourcing/pull/228) [`2f58e66`](https://github.com/CodeForBreakfast/eventsourcing/commit/2f58e665f90f3296f1e1b58bff89a7838365221a) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality and maintainability by eliminating unnecessary function wrappers throughout the codebase. These internal refactoring changes improve code readability and consistency without affecting any public APIs or behavior. All packages continue to work exactly as before with no breaking changes.

- Updated dependencies [[`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb)]:
  - @codeforbreakfast/eventsourcing-store@0.8.2

## 0.6.6

### Patch Changes

- Updated dependencies [[`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767)]:
  - @codeforbreakfast/eventsourcing-store@0.8.1

## 0.6.5

### Patch Changes

- [#167](https://github.com/CodeForBreakfast/eventsourcing/pull/167) [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated type-fest dependency to v5 and removed unused ESLint directives. No functional changes to the API.

- [#200](https://github.com/CodeForBreakfast/eventsourcing/pull/200) [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43) Thanks [@GraemeF](https://github.com/GraemeF)! - Enhanced ESLint rules to better detect unnecessary function wrappers. The custom rule now correctly identifies when `(x) => pipe(x, fn)` is redundant while allowing valid cases like `(x) => pipe(SomeService, fn)`. This improves code quality by preventing unnecessary indirection while preserving valid functional composition patterns.

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

- [#180](https://github.com/CodeForBreakfast/eventsourcing/pull/180) [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce documented justifications for all ESLint rule suppressions

  All `eslint-disable` comments now require a description explaining why the rule is being suppressed. This improves code maintainability by documenting the reasoning behind each exception to the linting rules.

- Updated dependencies [[`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222), [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf), [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43), [`4e9f8c9`](https://github.com/CodeForBreakfast/eventsourcing/commit/4e9f8c9711df00e01b0ab943dad67aa14d59df06), [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f), [`ae77963`](https://github.com/CodeForBreakfast/eventsourcing/commit/ae7796342df299997ece012b7090f1ce9190b0a4), [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a), [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b), [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8)]:
  - @codeforbreakfast/eventsourcing-store@0.8.0

## 0.6.4

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

## 0.6.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-store@0.7.3

## 0.6.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
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
  - @codeforbreakfast/eventsourcing-store@0.7.1

## 0.6.0

### Minor Changes

- [#85](https://github.com/CodeForBreakfast/eventsourcing/pull/85) [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a) Thanks [@GraemeF](https://github.com/GraemeF)! - Standardize API naming to follow Effect conventions

  Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.
  - Replace `create*` factory functions with `make*` (Effect convention)
  - Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
  - Remove backward compatibility aliases and redundant exports
  - Standardize all test interface methods to use Effect naming patterns

  This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.

### Patch Changes

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#96](https://github.com/CodeForBreakfast/eventsourcing/pull/96) [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce) Thanks [@GraemeF](https://github.com/GraemeF)! - Configure logger to be silent during tests to reduce output noise

  Reduces test output verbosity by configuring the Effect logger to be silent during test runs. This change:
  - Adds a `silentLogger` export to `@codeforbreakfast/buntest` for consistent test logger configuration
  - Replaces verbose logger configurations in test files with the shared silent logger
  - Eliminates noisy INFO and ERROR logs during test execution while preserving actual test results
  - Improves developer experience by making test output cleaner and more readable

  Users will see significantly less log output when running tests, making it easier to focus on test results and failures.

- Updated dependencies [[`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
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
