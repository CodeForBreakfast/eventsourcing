# @codeforbreakfast/eventsourcing-transport-inmemory

## 0.3.10

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor test code to follow proper functional programming patterns

  This is an internal refactoring of test code to eliminate ESLint rule violations by following proper Effect functional programming patterns. No public API changes.

## 0.3.9

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

## 0.3.8

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.7

## 0.3.7

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.6

## 0.3.6

### Patch Changes

- [#259](https://github.com/CodeForBreakfast/eventsourcing/pull/259) [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add Effect-native assertions and new ESLint rules

  **New Features:**
  - **buntest**: Added Effect-native assertion utilities (`expectEffect`, `toSucceedWith`, `toFailWith`) and a new ESLint rule `prefer-effect-assertions` to enforce their usage
  - **eslint-effect**: Added two new rules: `no-effect-if-option-check` and `prefer-get-or-undefined`

  **Bug Fixes & Improvements:**
  - Replaced `Effect.sync(expect())` patterns with Effect-native assertions across test suites
  - Removed unnecessary function aliases to improve code readability
  - Fixed nested pipe calls and redundant Effect.sync wrappers

## 0.3.5

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

- [#199](https://github.com/CodeForBreakfast/eventsourcing/pull/199) [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve code quality by using idiomatic Effect patterns

  The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

- [#159](https://github.com/CodeForBreakfast/eventsourcing/pull/159) [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes
  - Simplified lint task input patterns to prevent cache inconsistencies
  - Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
  - Added missing TSX test file patterns to ensure all test files are tracked
  - Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

  This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.

- [#179](https://github.com/CodeForBreakfast/eventsourcing/pull/179) [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.

- Updated dependencies [[`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.5

## 0.3.4

### Patch Changes

- [#155](https://github.com/CodeForBreakfast/eventsourcing/pull/155) [`60dbc6d`](https://github.com/CodeForBreakfast/eventsourcing/commit/60dbc6d54e6049b51cb5739cb2295fc31a35b7e9) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache configuration for lint tasks to properly invalidate when test files change. This ensures lint errors in test files are always caught during CI checks.

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

- Updated dependencies [[`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.4

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

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#122](https://github.com/CodeForBreakfast/eventsourcing/pull/122) [`9c2d879`](https://github.com/CodeForBreakfast/eventsourcing/commit/9c2d8795116855ac38b0f294c1ed1416dd03b7c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Reorganized transport tests to eliminate duplication and improve maintainability. Tests are now properly organized across separate directories for better clarity and reuse of common patterns.

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
