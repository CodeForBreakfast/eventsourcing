# @codeforbreakfast/eventsourcing-websocket

## 0.3.0

### Minor Changes

- [#85](https://github.com/CodeForBreakfast/eventsourcing/pull/85) [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a) Thanks [@GraemeF](https://github.com/GraemeF)! - Standardize API naming to follow Effect conventions

  Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.
  - Replace `create*` factory functions with `make*` (Effect convention)
  - Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
  - Remove backward compatibility aliases and redundant exports
  - Standardize all test interface methods to use Effect naming patterns

  This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.

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

- [#106](https://github.com/CodeForBreakfast/eventsourcing/pull/106) [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511) Thanks [@GraemeF](https://github.com/GraemeF)! - **BREAKING CHANGE**: Rename package from `@codeforbreakfast/eventsourcing-transport-contracts` to `@codeforbreakfast/eventsourcing-transport`

  The transport contracts package has been renamed to better reflect its role as the core transport abstraction layer. No API changes - only the package name has changed.

### Patch Changes

- [#125](https://github.com/CodeForBreakfast/eventsourcing/pull/125) [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6) Thanks [@GraemeF](https://github.com/GraemeF)! - Ensure pre-1.0 packages use minor version bumps instead of major

  Updated changeset configurations to use minor version bumps as the maximum for all pre-1.0 packages, following semantic versioning best practices for pre-release versions. This ensures breaking changes are communicated through minor version increments rather than major version bumps while packages are still in initial development.

- [#89](https://github.com/CodeForBreakfast/eventsourcing/pull/89) [`603ec3c`](https://github.com/CodeForBreakfast/eventsourcing/commit/603ec3cebbb7de64121067b81672c265a59e7dcc) Thanks [@GraemeF](https://github.com/GraemeF)! - Add ESLint rule to prevent .js extensions in imports and fix existing violation

  **Improvements:**
  - Added `import/extensions` ESLint rule configured to disallow `.js`, `.ts`, and `.tsx` extensions in import statements
  - Fixed existing violation in `@codeforbreakfast/eventsourcing-websocket` where `./lib/index.js` import incorrectly included `.js` extension
  - Added `eslint-plugin-import` dependency to support the new linting rule

  This change helps maintain consistency with TypeScript/Bun configuration where source files don't need file extensions in imports, preventing future accidental additions of unnecessary extensions.

- [#101](https://github.com/CodeForBreakfast/eventsourcing/pull/101) [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce consistent Effect syntax by forbidding Effect.gen usage

  Adds ESLint rule to prevent use of Effect.gen in favor of pipe-based Effect composition. This ensures consistent code style and encourages the use of the more explicit pipe syntax throughout the codebase. All existing Effect.gen usage has been refactored to use Effect.pipe patterns.

- [#114](https://github.com/CodeForBreakfast/eventsourcing/pull/114) [`809c63f`](https://github.com/CodeForBreakfast/eventsourcing/commit/809c63ff3ba63abb3f52e49c965bb9a517bdde14) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove test scripts for convenience package. The `@codeforbreakfast/eventsourcing-websocket` package no longer includes test and test:watch scripts since this is a convenience package that simply re-exports functionality tested in the underlying packages.

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#104](https://github.com/CodeForBreakfast/eventsourcing/pull/104) [`3fdab51`](https://github.com/CodeForBreakfast/eventsourcing/commit/3fdab51d836bdf17ee9553a1728a584df35027a1) Thanks [@GraemeF](https://github.com/GraemeF)! - Rename protocol package to remove "default" suffix

  **Breaking Changes:**
  - Package `@codeforbreakfast/eventsourcing-protocol-default` is now `@codeforbreakfast/eventsourcing-protocol`
  - Update imports from `@codeforbreakfast/eventsourcing-protocol-default` to `@codeforbreakfast/eventsourcing-protocol`

  **Other Changes:**
  - Updated documentation and examples to reflect new package name
  - Simplified installation instructions without confusing "default" terminology

- Updated dependencies [[`e0c59ca`](https://github.com/CodeForBreakfast/eventsourcing/commit/e0c59ca1ac5e235502d4efce137fda05ffe7418d), [`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`1d595d3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1d595d35b03f20e4a26fa712d30c22b66354519b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`51ee12c`](https://github.com/CodeForBreakfast/eventsourcing/commit/51ee12c86ab9ccf3b127408ee6298332be38554a), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`3fdab51`](https://github.com/CodeForBreakfast/eventsourcing/commit/3fdab51d836bdf17ee9553a1728a584df35027a1), [`5a8c349`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a8c349aedf08d7f9eecc23ff801acd1f9e0e511), [`9c2d879`](https://github.com/CodeForBreakfast/eventsourcing/commit/9c2d8795116855ac38b0f294c1ed1416dd03b7c4), [`809c63f`](https://github.com/CodeForBreakfast/eventsourcing/commit/809c63ff3ba63abb3f52e49c965bb9a517bdde14), [`3b1a210`](https://github.com/CodeForBreakfast/eventsourcing/commit/3b1a210ab0c8a730cc0b950ea5a1893e7a55dfa1)]:
  - @codeforbreakfast/eventsourcing-protocol@0.3.0
  - @codeforbreakfast/eventsourcing-transport-websocket@0.3.0
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
  - @codeforbreakfast/eventsourcing-protocol-default@0.2.2
  - @codeforbreakfast/eventsourcing-transport@0.2.2
  - @codeforbreakfast/eventsourcing-transport-websocket@0.2.2

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
  - @codeforbreakfast/eventsourcing-protocol-default@0.2.1
  - @codeforbreakfast/eventsourcing-transport@0.2.1
  - @codeforbreakfast/eventsourcing-transport-websocket@0.2.1

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
  - @codeforbreakfast/eventsourcing-protocol-default@0.2.0
  - @codeforbreakfast/eventsourcing-transport@0.2.0
  - @codeforbreakfast/eventsourcing-transport-websocket@0.2.0
