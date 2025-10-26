# @codeforbreakfast/eventsourcing-websocket

## 0.3.14

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
  - @codeforbreakfast/eventsourcing-protocol@0.4.6
  - @codeforbreakfast/eventsourcing-transport-websocket@0.5.4

## 0.3.13

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-protocol@0.4.5
  - @codeforbreakfast/eventsourcing-transport@0.3.7
  - @codeforbreakfast/eventsourcing-transport-websocket@0.5.3

## 0.3.12

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-transport-websocket@0.5.2
  - @codeforbreakfast/eventsourcing-transport@0.3.6
  - @codeforbreakfast/eventsourcing-protocol@0.4.4

## 0.3.11

### Patch Changes

- [#255](https://github.com/CodeForBreakfast/eventsourcing/pull/255) [`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated internal implementation to comply with `no-if-statement` rule.

  Test code now uses if statements where appropriate (for assertions and side effects), while production code follows functional patterns. This is an internal refactoring with no API changes.

- Updated dependencies [[`b772d4d`](https://github.com/CodeForBreakfast/eventsourcing/commit/b772d4d8dbf905b2e88c17ff9793162318370687), [`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe), [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2)]:
  - @codeforbreakfast/eventsourcing-transport-websocket@0.5.1
  - @codeforbreakfast/eventsourcing-protocol@0.4.3

## 0.3.10

### Patch Changes

- Updated dependencies [[`9087d1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/9087d1a1661f3064cb07bf702100df91c4e3dd5f)]:
  - @codeforbreakfast/eventsourcing-transport-websocket@0.5.0
  - @codeforbreakfast/eventsourcing-protocol@0.4.2

## 0.3.9

### Patch Changes

- [#228](https://github.com/CodeForBreakfast/eventsourcing/pull/228) [`2f58e66`](https://github.com/CodeForBreakfast/eventsourcing/commit/2f58e665f90f3296f1e1b58bff89a7838365221a) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality and maintainability by eliminating unnecessary function wrappers throughout the codebase. These internal refactoring changes improve code readability and consistency without affecting any public APIs or behavior. All packages continue to work exactly as before with no breaking changes.

- [#222](https://github.com/CodeForBreakfast/eventsourcing/pull/222) [`6ea70b0`](https://github.com/CodeForBreakfast/eventsourcing/commit/6ea70b083d217cbda2bf1bbae23279db60570b00) Thanks [@GraemeF](https://github.com/GraemeF)! - Protocol operations now automatically create Effect spans for distributed tracing. All commands, subscriptions, events, and results include W3C Trace Context fields (traceId, parentId). The protocol creates spans named 'protocol.send-command', 'protocol.subscribe', 'server-protocol.send-result', and 'server-protocol.publish-event' with relevant attributes, enabling end-to-end tracing across the event sourcing system.

- Updated dependencies [[`2f58e66`](https://github.com/CodeForBreakfast/eventsourcing/commit/2f58e665f90f3296f1e1b58bff89a7838365221a), [`26ed0a0`](https://github.com/CodeForBreakfast/eventsourcing/commit/26ed0a0421106b73ad787f7e22ce110690104296), [`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb), [`6ea70b0`](https://github.com/CodeForBreakfast/eventsourcing/commit/6ea70b083d217cbda2bf1bbae23279db60570b00)]:
  - @codeforbreakfast/eventsourcing-protocol@0.4.2
  - @codeforbreakfast/eventsourcing-transport-websocket@0.4.3

## 0.3.8

### Patch Changes

- Updated dependencies []:
  - @codeforbreakfast/eventsourcing-protocol@0.4.1
  - @codeforbreakfast/eventsourcing-transport-websocket@0.4.2

## 0.3.7

### Patch Changes

- [#198](https://github.com/CodeForBreakfast/eventsourcing/pull/198) [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix all TypeScript code examples in documentation to pass validation. All examples now compile successfully with proper imports, type declarations, and adherence to functional programming patterns using pipe() composition.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.

- [#159](https://github.com/CodeForBreakfast/eventsourcing/pull/159) [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes
  - Simplified lint task input patterns to prevent cache inconsistencies
  - Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
  - Added missing TSX test file patterns to ensure all test files are tracked
  - Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

  This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.

- [#193](https://github.com/CodeForBreakfast/eventsourcing/pull/193) [`38cd622`](https://github.com/CodeForBreakfast/eventsourcing/commit/38cd622f81a026c17f0e8c3c7a957e3ca0388806) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved client documentation to emphasize transport abstraction.

  The documentation now clearly shows:
  - Protocol package provides transport-agnostic API (`sendWireCommand`, `subscribe`)
  - WebSocket package is used only for creating Effect layers
  - Application code should be written against protocol abstractions
  - Transport choice (WebSocket, HTTP, etc.) is configured once when setting up layers

  This makes it easier to:
  - Write transport-independent application code
  - Switch transports without changing application logic
  - Understand the proper separation between layers

- [#169](https://github.com/CodeForBreakfast/eventsourcing/pull/169) [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720) Thanks [@GraemeF](https://github.com/GraemeF)! - Modernized service definitions to use Effect-TS 2.3+ patterns. Services now use `Context.Tag` instead of `Effect.Tag` with inlined service shapes, providing better type inference and cleaner code. Generic services use the `Context.GenericTag` factory pattern for proper type parameter support.

  For most users, these are internal improvements with no breaking changes. If you're directly referencing service types (like `CommandRegistryService`), use `Context.Tag.Service<typeof ServiceName>` to extract the service type instead.

- [#178](https://github.com/CodeForBreakfast/eventsourcing/pull/178) [`f4c06d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/f4c06d6430f61976ec9c28af38faac39f88800d1) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored pipe usage patterns to comply with simplified functional composition rules. All `pipe(fn(x), ...)` patterns have been converted to `pipe(x, fn, ...)` for better readability and consistency. This change also fixes Effect type signatures to properly use `never` instead of `unknown` in context parameters where appropriate.

- Updated dependencies [[`4419aac`](https://github.com/CodeForBreakfast/eventsourcing/commit/4419aaccb59f4e4f85695764ef6df81c6da69fce), [`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222), [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf), [`96c7eb3`](https://github.com/CodeForBreakfast/eventsourcing/commit/96c7eb357abb7a36bc45a007bd58ec6e594f7abb), [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43), [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f), [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a), [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe), [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`feaa07d`](https://github.com/CodeForBreakfast/eventsourcing/commit/feaa07df4f4d99bf0b69113e6c1758880727e18b), [`38cd622`](https://github.com/CodeForBreakfast/eventsourcing/commit/38cd622f81a026c17f0e8c3c7a957e3ca0388806), [`0f7cba1`](https://github.com/CodeForBreakfast/eventsourcing/commit/0f7cba1afa2808d6812f909707c052abcf2dc09b), [`5c27220`](https://github.com/CodeForBreakfast/eventsourcing/commit/5c2722029b72f69d23b3e0dd7ccdb46270158959), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b), [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8), [`f4c06d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/f4c06d6430f61976ec9c28af38faac39f88800d1)]:
  - @codeforbreakfast/eventsourcing-transport-websocket@0.4.2
  - @codeforbreakfast/eventsourcing-protocol@0.4.0
  - @codeforbreakfast/eventsourcing-transport@0.3.5

## 0.3.6

### Patch Changes

- Updated dependencies [[`ac00ba4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac00ba4fc20800df3527541e8eebbeda61356c99), [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-protocol@0.3.5
  - @codeforbreakfast/eventsourcing-transport@0.3.4
  - @codeforbreakfast/eventsourcing-transport-websocket@0.4.1

## 0.3.5

### Patch Changes

- Updated dependencies []:
  - @codeforbreakfast/eventsourcing-protocol@0.3.4

## 0.3.4

### Patch Changes

- Updated dependencies [[`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7), [`176f1c2`](https://github.com/CodeForBreakfast/eventsourcing/commit/176f1c2cfe2878585600a3ca80ae245be6faefd7)]:
  - @codeforbreakfast/eventsourcing-transport-websocket@0.4.0

## 0.3.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-protocol@0.3.3
  - @codeforbreakfast/eventsourcing-transport@0.3.3
  - @codeforbreakfast/eventsourcing-transport-websocket@0.3.3

## 0.3.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-protocol@0.3.2
  - @codeforbreakfast/eventsourcing-transport@0.3.2
  - @codeforbreakfast/eventsourcing-transport-websocket@0.3.2

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
  - @codeforbreakfast/eventsourcing-protocol@0.3.1
  - @codeforbreakfast/eventsourcing-transport@0.3.1
  - @codeforbreakfast/eventsourcing-transport-websocket@0.3.1

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
