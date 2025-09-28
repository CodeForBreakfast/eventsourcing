# @codeforbreakfast/eventsourcing-commands

## 0.3.0

### Minor Changes

- [#147](https://github.com/CodeForBreakfast/eventsourcing/pull/147) [`f64ebb8`](https://github.com/CodeForBreakfast/eventsourcing/commit/f64ebb8a4e1f111e3e0f6bfed1be10c4e988436a) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace command handler registrations with Effect pattern matching for better type safety and exhaustive command handling. The new API uses Effect's `Match.exhaustive` to ensure all command types are handled at compile time, eliminating runtime handler lookups and providing stronger TypeScript inference within each match arm.

  **Breaking Changes:**
  - `createRegistration()` and registration-based API removed
  - `makeCommandRegistry()` now takes `(commands, matcher)` instead of `registrations`
  - `CommandHandler` interface replaced with functional pattern matching

  **Migration:**
  Replace handler registrations with a single matcher function using `Match.value()` and `Match.exhaustive` for compile-time command handling safety.

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

### Patch Changes

- [#113](https://github.com/CodeForBreakfast/eventsourcing/pull/113) [`a7f5b72`](https://github.com/CodeForBreakfast/eventsourcing/commit/a7f5b72bc6379c7a864ba8b5d1fcc578970c3fd6) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove redundant documentation - package now relies on comprehensive README and test files for documentation

- Updated dependencies [[`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-store@0.7.0
