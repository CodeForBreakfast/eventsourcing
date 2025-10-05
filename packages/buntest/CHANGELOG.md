# @codeforbreakfast/buntest

## 0.2.3

### Patch Changes

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

- [#159](https://github.com/CodeForBreakfast/eventsourcing/pull/159) [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes
  - Simplified lint task input patterns to prevent cache inconsistencies
  - Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
  - Added missing TSX test file patterns to ensure all test files are tracked
  - Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

  This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.

## 0.2.2

### Patch Changes

- [#153](https://github.com/CodeForBreakfast/eventsourcing/pull/153) [`b1a2f97`](https://github.com/CodeForBreakfast/eventsourcing/commit/b1a2f9710bf40d879b1cbaa53ca001664d88f9df) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplified type definitions while strengthening type safety:
  - Error classes no longer expose redundant static `is` methods - use built-in tag discrimination instead
  - Improved type guard implementation using Effect's discriminated union pattern
  - Test service definitions now use proper service interfaces instead of bare string literals

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

## 0.2.0

### Minor Changes

- [#93](https://github.com/CodeForBreakfast/eventsourcing/pull/93) [`a484586`](https://github.com/CodeForBreakfast/eventsourcing/commit/a4845860416746fc4effc75af3822a72f918dbaa) Thanks [@GraemeF](https://github.com/GraemeF)! - Add internal Effect testing utilities package adapted from @effect/vitest
  - Port Effect testing framework to work exclusively with Bun test runner
  - Includes it.effect, it.scoped, it.live testing methods for Effect workflows
  - Layer sharing capabilities for test setup
  - Custom equality testers for Effect types (Option, Either, Exit)
  - Testing utilities for assertions and test data generation
  - Flaky test retry functionality with configurable timeouts

### Patch Changes

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#96](https://github.com/CodeForBreakfast/eventsourcing/pull/96) [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce) Thanks [@GraemeF](https://github.com/GraemeF)! - Configure logger to be silent during tests to reduce output noise

  Reduces test output verbosity by configuring the Effect logger to be silent during test runs. This change:
  - Adds a `silentLogger` export to `@codeforbreakfast/buntest` for consistent test logger configuration
  - Replaces verbose logger configurations in test files with the shared silent logger
  - Eliminates noisy INFO and ERROR logs during test execution while preserving actual test results
  - Improves developer experience by making test output cleaner and more readable

  Users will see significantly less log output when running tests, making it easier to focus on test results and failures.
