# @codeforbreakfast/eventsourcing-protocol-default

## 0.3.0

### Minor Changes

- [#104](https://github.com/CodeForBreakfast/eventsourcing/pull/104) [`3fdab51`](https://github.com/CodeForBreakfast/eventsourcing/commit/3fdab51d836bdf17ee9553a1728a584df35027a1) Thanks [@GraemeF](https://github.com/GraemeF)! - Rename protocol package to remove "default" suffix

  **Breaking Changes:**
  - Package `@codeforbreakfast/eventsourcing-protocol-default` is now `@codeforbreakfast/eventsourcing-protocol`
  - Update imports from `@codeforbreakfast/eventsourcing-protocol-default` to `@codeforbreakfast/eventsourcing-protocol`

  **Other Changes:**
  - Updated documentation and examples to reflect new package name
  - Simplified installation instructions without confusing "default" terminology

- [#106](https://github.com/CodeForBreakfast/eventsourcing/pull/106) [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511) Thanks [@GraemeF](https://github.com/GraemeF)! - **BREAKING CHANGE**: Rename package from `@codeforbreakfast/eventsourcing-transport-contracts` to `@codeforbreakfast/eventsourcing-transport`

  The transport contracts package has been renamed to better reflect its role as the core transport abstraction layer. No API changes - only the package name has changed.

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

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- Updated dependencies [[`e0c59ca`](https://github.com/CodeForBreakfast/eventsourcing/commit/e0c59ca1ac5e235502d4efce137fda05ffe7418d), [`a7f5b72`](https://github.com/CodeForBreakfast/eventsourcing/commit/a7f5b72bc6379c7a864ba8b5d1fcc578970c3fd6), [`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.0
  - @codeforbreakfast/eventsourcing-store@0.7.0
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
  - @codeforbreakfast/eventsourcing-store@0.6.7
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
  - @codeforbreakfast/eventsourcing-store@0.6.6
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
