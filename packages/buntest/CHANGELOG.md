# @codeforbreakfast/buntest

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
