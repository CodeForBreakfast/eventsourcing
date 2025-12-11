# @codeforbreakfast/eventsourcing-store-inmemory

## 0.2.14

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

## 0.2.13

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

## 0.2.12

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Bump version for dependency updates

  Internal dependencies were updated with test refactorings. No functional changes to this package.

- Updated dependencies [[`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4)]:
  - @codeforbreakfast/eventsourcing-store@0.9.1

## 0.2.11

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

## 0.2.10

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-store@0.8.5

## 0.2.9

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-store@0.8.4

## 0.2.8

### Patch Changes

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

## 0.2.7

### Patch Changes

- Updated dependencies [[`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb)]:
  - @codeforbreakfast/eventsourcing-store@0.8.2

## 0.2.6

### Patch Changes

- Updated dependencies [[`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767)]:
  - @codeforbreakfast/eventsourcing-store@0.8.1

## 0.2.5

### Patch Changes

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

- Updated dependencies [[`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222), [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf), [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43), [`4e9f8c9`](https://github.com/CodeForBreakfast/eventsourcing/commit/4e9f8c9711df00e01b0ab943dad67aa14d59df06), [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f), [`ae77963`](https://github.com/CodeForBreakfast/eventsourcing/commit/ae7796342df299997ece012b7090f1ce9190b0a4), [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a), [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b), [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8)]:
  - @codeforbreakfast/eventsourcing-store@0.8.0

## 0.2.4

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

## 0.2.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-store@0.7.3

## 0.2.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-store@0.7.2

## 0.2.1

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

## 0.2.0

### Minor Changes

- [#105](https://github.com/CodeForBreakfast/eventsourcing/pull/105) [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1) Thanks [@GraemeF](https://github.com/GraemeF)! - Extract in-memory EventStore implementation into separate package

  The in-memory EventStore implementation has been moved from `@codeforbreakfast/eventsourcing-store` to its own dedicated `@codeforbreakfast/eventsourcing-store-inmemory` package for better architectural separation.

  **Benefits:**
  - **Cleaner Architecture**: Core package contains only abstractions and interfaces
  - **Better Modularity**: In-memory implementation is self-contained with its own documentation
  - **Improved Separation**: Clear boundaries between core types and specific implementations
  - **Enhanced Maintainability**: Each package has focused responsibilities

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

### Patch Changes

- [#125](https://github.com/CodeForBreakfast/eventsourcing/pull/125) [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6) Thanks [@GraemeF](https://github.com/GraemeF)! - Ensure pre-1.0 packages use minor version bumps instead of major

  Updated changeset configurations to use minor version bumps as the maximum for all pre-1.0 packages, following semantic versioning best practices for pre-release versions. This ensures breaking changes are communicated through minor version increments rather than major version bumps while packages are still in initial development.

- [#119](https://github.com/CodeForBreakfast/eventsourcing/pull/119) [`2b3f3d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b3f3d6dc0a4b69aa6384ad65e3bd54d98c23840) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce functional programming patterns through ESLint rules and refactor InMemoryStore
  - Added ESLint rule to ban class declarations except for Effect-sanctioned patterns (service tags, error classes, and Schema classes)
  - Refactored InMemoryStore from a class to a functional factory pattern following Effect library conventions
  - The InMemoryStore API remains unchanged - this is an internal implementation improvement

- Updated dependencies [[`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-store@0.7.0
