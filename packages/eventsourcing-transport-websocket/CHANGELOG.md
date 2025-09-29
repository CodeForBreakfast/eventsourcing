# @codeforbreakfast/eventsourcing-transport-websocket

## 0.4.1

### Patch Changes

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

- Updated dependencies [[`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.4

## 0.4.0

### Minor Changes

- [#143](https://github.com/CodeForBreakfast/eventsourcing/pull/143) [`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored WebSocket transport to use @effect/platform/Socket abstraction

  **Breaking Changes:**
  - The WebSocket transport now uses the @effect/platform/Socket module instead of raw WebSocket API
  - Connection error handling has been improved with better Effect-based lifecycle management
  - The transport now properly manages resources using Effect's Scope

  **Benefits:**
  - Better integration with Effect ecosystem
  - Improved error handling and resource cleanup
  - Proper structured concurrency for WebSocket connections
  - More robust connection state management

  **Migration:**
  No changes required for consumers - the public API remains the same. The transport continues to implement the standard Client.Transport interface.

### Patch Changes

- [#143](https://github.com/CodeForBreakfast/eventsourcing/pull/143) [`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7) Thanks [@GraemeF](https://github.com/GraemeF)! - Moved misplaced changeset from package directory to proper .changeset location and enhanced validation to catch invalid package references

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

- [#121](https://github.com/CodeForBreakfast/eventsourcing/pull/121) [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce functional programming patterns with stricter ESLint rules

  ## Changes
  - **Classes are now forbidden** except for Effect library patterns (Data.TaggedError, Effect.Tag, Context.Tag, Context.GenericTag, Schema.Class)
  - **Effect.gen is now forbidden** - all code must use pipe-based composition with Effect.all and Effect.forEach
  - Fixed test code to comply with functional programming patterns by replacing classes with factory functions
  - Refactored Effect.gen usage to pipe-based functional composition

  These changes enforce a more consistent functional programming style across the codebase, improving maintainability and reducing cognitive overhead when working with Effect.

- [#117](https://github.com/CodeForBreakfast/eventsourcing/pull/117) [`1d595d3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1d595d35b03f20e4a26fa712d30c22b66354519b) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix WebSocket disconnection detection when server closes

  Improved handling of server-initiated disconnections in WebSocket transport. Clients now properly receive 'disconnected' state notifications when the server shuts down. This ensures applications can detect and respond to connection loss appropriately.

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

- [#99](https://github.com/CodeForBreakfast/eventsourcing/pull/99) [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc) Thanks [@GraemeF](https://github.com/GraemeF)! - Remove all vitest dependencies and references in favor of bun:test

  All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.

- [#122](https://github.com/CodeForBreakfast/eventsourcing/pull/122) [`9c2d879`](https://github.com/CodeForBreakfast/eventsourcing/commit/9c2d8795116855ac38b0f294c1ed1416dd03b7c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Reorganized transport tests to eliminate duplication and improve maintainability. Tests are now properly organized across separate directories for better clarity and reuse of common patterns.

- [#114](https://github.com/CodeForBreakfast/eventsourcing/pull/114) [`809c63f`](https://github.com/CodeForBreakfast/eventsourcing/commit/809c63ff3ba63abb3f52e49c965bb9a517bdde14) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved WebSocket transport testing approach
  - Removed problematic global state mocking that violated test isolation
  - Documented testing options including @effect/platform/Socket for future improvements
  - Simplified test suite to focus on testable scenarios without mocking
  - Integration tests continue to provide coverage for main functionality

- [#118](https://github.com/CodeForBreakfast/eventsourcing/pull/118) [`3b1a210`](https://github.com/CodeForBreakfast/eventsourcing/commit/3b1a210ab0c8a730cc0b950ea5a1893e7a55dfa1) Thanks [@GraemeF](https://github.com/GraemeF)! - Add comprehensive test coverage for WebSocket transport
  - Added unit tests for connection lifecycle including state transitions and delayed connections
  - Added tests for error scenarios including connection failures, timeouts, and connection refused
  - Added tests for message handling including delivery, malformed JSON filtering, and subscription filters
  - Added tests for publishing constraints when connected or disconnected
  - Implemented mock WebSocket for deterministic testing without real network connections

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
