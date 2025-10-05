# @codeforbreakfast/eslint-effect

## 0.2.0

### Minor Changes

- [#205](https://github.com/CodeForBreakfast/eventsourcing/pull/205) [`0a7382a`](https://github.com/CodeForBreakfast/eventsourcing/commit/0a7382a55578bbdd2350ad624b0333ff209fbf1d) Thanks [@GraemeF](https://github.com/GraemeF)! - New package: ESLint rules and configurations for Effect projects

  This package provides custom ESLint rules and pre-configured rule sets to enforce functional programming best practices and idiomatic Effect code patterns in your TypeScript projects.

  **Custom Rules:**
  - `no-unnecessary-pipe-wrapper` - Detects unnecessary function wrappers around single pipe operations
  - `prefer-match-tag` - Enforces `Match.tag()` over `Match.when()` for `_tag` discriminators (auto-fixable)
  - `prefer-match-over-conditionals` - Encourages declarative `Match` patterns over imperative conditionals in Effect callbacks
  - `prefer-schema-validation-over-assertions` - Discourages type assertions in favor of runtime validation with `Schema.decodeUnknown`

  **Configuration Presets:**
  - `effectSyntaxRestrictions` - Forbids Effect.gen, classes (except service tags), runSync/runPromise, direct \_tag access, and enforces Effect.andThen/as patterns
  - `simplePipeSyntaxRestrictions` - Ensures consistent pipe usage, forbids curried calls, nested pipes, and multiple pipes per function
  - `functionalImmutabilityRules` - Leverages eslint-plugin-functional with Effect-aware configuration for readonly types, no let bindings, and immutable data patterns

  The package makes no assumptions about how rules should be configured for test files - consumers define their own test-specific rules based on their testing needs.

### Patch Changes

- [#207](https://github.com/CodeForBreakfast/eventsourcing/pull/207) [`7b902b9`](https://github.com/CodeForBreakfast/eventsourcing/commit/7b902b9e5a86a60534640a4358e974a4b0cd2527) Thanks [@GraemeF](https://github.com/GraemeF)! - Complete test coverage for all ESLint rules

  Added comprehensive test coverage ensuring all custom rules and syntax restrictions are properly tested. This includes adding a missing test case for the curried function call restriction and consolidating all test fixtures into the eslint-effect package.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.
