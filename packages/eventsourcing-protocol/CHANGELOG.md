# @codeforbreakfast/eventsourcing-protocol-default

## 0.4.10

### Patch Changes

- [#389](https://github.com/CodeForBreakfast/eventsourcing/pull/389) [`12e788d`](https://github.com/CodeForBreakfast/eventsourcing/commit/12e788d7b7820a7e70fc8781dccb955fca84c271) Thanks [@GraemeF](https://github.com/GraemeF)! - Widen `@effect/platform` peer dependency range from explicit minor versions to `>=0.90.0 <1.0.0`.

  This makes the packages more consumer-friendly by automatically supporting new Effect platform releases without requiring a library update, while still maintaining compatibility with versions 0.90.0 and above.

- Updated dependencies [[`12e788d`](https://github.com/CodeForBreakfast/eventsourcing/commit/12e788d7b7820a7e70fc8781dccb955fca84c271)]:
  - @codeforbreakfast/eventsourcing-store@0.9.4
  - @codeforbreakfast/eventsourcing-commands@0.4.10
  - @codeforbreakfast/eventsourcing-transport@0.3.9

## 0.4.9

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
  - @codeforbreakfast/eventsourcing-commands@0.4.9
  - @codeforbreakfast/eventsourcing-store@0.9.3
  - @codeforbreakfast/eventsourcing-transport@0.3.8

## 0.4.8

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
  - @codeforbreakfast/eventsourcing-commands@0.4.8
  - @codeforbreakfast/eventsourcing-store@0.9.2

## 0.4.7

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactor test helper functions to use proper Effect-based error handling

  This change improves the internal test utilities in the protocol package by replacing imperative code patterns with functional Effect-based implementations using Match.tag for discriminated union handling.

  **What changed:**
  - Refactored `verifySuccessResult` to return `Effect.Effect<void, Error>` instead of using side effects
  - Refactored `verifyFailureResult` to return `Effect.Effect<void, Error>` with proper error channel usage
  - Replaced direct type guard usage with `Match.tag` for discriminated union matching on CommandResult
  - Updated `sendCommandWithVerification` to use `Effect.flatMap` to handle Effect-returning verify functions
  - Extracted helper functions like `matchParsedError`, `parseErrorMessage`, and `matchFailureError` to avoid nested pipes

  **Why this matters:**

  These are internal test utilities, but the refactoring demonstrates proper Effect patterns:
  - Errors flow through Effect's error channel using `Effect.fail` instead of throwing exceptions
  - Uses `Match.tag` for discriminated unions rather than imperative if statements with type guards
  - All verification logic is now pure functional composition
  - Better alignment with Effect's functional programming idioms

  **No API changes:**

  This is purely an internal refactoring of test helpers. There are no changes to the public API or behavior of the eventsourcing-protocol package.

- Updated dependencies [[`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4), [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.7
  - @codeforbreakfast/eventsourcing-store@0.9.1

## 0.4.6

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
  - @codeforbreakfast/eventsourcing-commands@0.4.6

## 0.4.5

### Patch Changes

- [#281](https://github.com/CodeForBreakfast/eventsourcing/pull/281) [`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95) Thanks [@renovate](https://github.com/apps/renovate)! - Update type-fest dependency to v5.1.0, which includes new utility types (TupleOf, Xor, SplitOnRestElement) and improvements to existing types (PartialDeep, IsEqual, FixedLengthArray). This internal dependency update has no impact on the public API of these packages.

- Updated dependencies [[`3de03fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/3de03fa652e0b6fde85fd402fb82b33828e9ec95)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.5
  - @codeforbreakfast/eventsourcing-store@0.8.5
  - @codeforbreakfast/eventsourcing-transport@0.3.7

## 0.4.4

### Patch Changes

- [#278](https://github.com/CodeForBreakfast/eventsourcing/pull/278) [`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed TypeScript declaration file generation to ensure all packages publish with complete type definitions. This resolves an issue where some type declaration files were missing from published packages, which could cause TypeScript errors when importing these packages.

- Updated dependencies [[`5fdd207`](https://github.com/CodeForBreakfast/eventsourcing/commit/5fdd207a40c5e5f7b6ec8102f28e8d729a56290f)]:
  - @codeforbreakfast/eventsourcing-transport@0.3.6
  - @codeforbreakfast/eventsourcing-store@0.8.4
  - @codeforbreakfast/eventsourcing-commands@0.4.4

## 0.4.3

### Patch Changes

- [#255](https://github.com/CodeForBreakfast/eventsourcing/pull/255) [`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated internal implementation to comply with `no-if-statement` rule.

  Test code now uses if statements where appropriate (for assertions and side effects), while production code follows functional patterns. This is an internal refactoring with no API changes.

- [#259](https://github.com/CodeForBreakfast/eventsourcing/pull/259) [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add Effect-native assertions and new ESLint rules

  **New Features:**
  - **buntest**: Added Effect-native assertion utilities (`expectEffect`, `toSucceedWith`, `toFailWith`) and a new ESLint rule `prefer-effect-assertions` to enforce their usage
  - **eslint-effect**: Added two new rules: `no-effect-if-option-check` and `prefer-get-or-undefined`

  **Bug Fixes & Improvements:**
  - Replaced `Effect.sync(expect())` patterns with Effect-native assertions across test suites
  - Removed unnecessary function aliases to improve code readability
  - Fixed nested pipe calls and redundant Effect.sync wrappers

- Updated dependencies [[`978ef1a`](https://github.com/CodeForBreakfast/eventsourcing/commit/978ef1ab13de530c3f82c45816b4c861594a90fe), [`df504f3`](https://github.com/CodeForBreakfast/eventsourcing/commit/df504f3658772dbb7f5c6538288d67a7f85a29d2)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.3
  - @codeforbreakfast/eventsourcing-store@0.8.3

## 0.4.2

### Patch Changes

- [#228](https://github.com/CodeForBreakfast/eventsourcing/pull/228) [`2f58e66`](https://github.com/CodeForBreakfast/eventsourcing/commit/2f58e665f90f3296f1e1b58bff89a7838365221a) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality and maintainability by eliminating unnecessary function wrappers throughout the codebase. These internal refactoring changes improve code readability and consistency without affecting any public APIs or behavior. All packages continue to work exactly as before with no breaking changes.

- [#224](https://github.com/CodeForBreakfast/eventsourcing/pull/224) [`26ed0a0`](https://github.com/CodeForBreakfast/eventsourcing/commit/26ed0a0421106b73ad787f7e22ce110690104296) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved OpenTelemetry span naming and attributes to follow semantic conventions. Protocol spans now use standardized naming (`eventsourcing.Protocol/<method>`) and include proper RPC and messaging attributes for better observability and integration with OTEL tooling.

- [#222](https://github.com/CodeForBreakfast/eventsourcing/pull/222) [`6ea70b0`](https://github.com/CodeForBreakfast/eventsourcing/commit/6ea70b083d217cbda2bf1bbae23279db60570b00) Thanks [@GraemeF](https://github.com/GraemeF)! - Protocol operations now automatically create Effect spans for distributed tracing. All commands, subscriptions, events, and results include W3C Trace Context fields (traceId, parentId). The protocol creates spans named 'protocol.send-command', 'protocol.subscribe', 'server-protocol.send-result', and 'server-protocol.publish-event' with relevant attributes, enabling end-to-end tracing across the event sourcing system.

- Updated dependencies [[`238623c`](https://github.com/CodeForBreakfast/eventsourcing/commit/238623c4106cc0f0ca535211a69f65ffb07c86bb)]:
  - @codeforbreakfast/eventsourcing-store@0.8.2
  - @codeforbreakfast/eventsourcing-commands@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767)]:
  - @codeforbreakfast/eventsourcing-store@0.8.1
  - @codeforbreakfast/eventsourcing-commands@0.4.1

## 0.4.0

### Minor Changes

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

### Patch Changes

- [#167](https://github.com/CodeForBreakfast/eventsourcing/pull/167) [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf) Thanks [@GraemeF](https://github.com/GraemeF)! - Updated type-fest dependency to v5 and removed unused ESLint directives. No functional changes to the API.

- [#164](https://github.com/CodeForBreakfast/eventsourcing/pull/164) [`96c7eb3`](https://github.com/CodeForBreakfast/eventsourcing/commit/96c7eb357abb7a36bc45a007bd58ec6e594f7abb) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved code quality by configuring ESLint to recognize Effect types as immutable-by-contract and removing unnecessary ESLint suppressions. This change has no runtime impact but improves code maintainability.

  **WebSocket Transport**: Fixed mutation anti-patterns by replacing type-cast mutations with proper Effect immutable data structures (HashMap, HashSet, Ref). All 21 ESLint suppressions across websocket transport files have been removed.

  **Protocol**: Removed 15 unnecessary ESLint suppressions that are no longer needed with the improved ESLint configuration.

  **ESLint Configuration**: Configured functional programming rules to understand that Effect types (Ref, Queue, HashMap, HashSet, Stream, PubSub) are immutable-by-contract despite containing internal mutable state managed through controlled APIs.

- [#200](https://github.com/CodeForBreakfast/eventsourcing/pull/200) [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43) Thanks [@GraemeF](https://github.com/GraemeF)! - Enhanced ESLint rules to better detect unnecessary function wrappers. The custom rule now correctly identifies when `(x) => pipe(x, fn)` is redundant while allowing valid cases like `(x) => pipe(SomeService, fn)`. This improves code quality by preventing unnecessary indirection while preserving valid functional composition patterns.

- [#199](https://github.com/CodeForBreakfast/eventsourcing/pull/199) [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve code quality by using idiomatic Effect patterns

  The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.

- [#175](https://github.com/CodeForBreakfast/eventsourcing/pull/175) [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce simplified pipe usage patterns

  This update improves code maintainability and readability by enforcing consistent functional programming patterns. The codebase now exclusively uses the standalone `pipe()` function instead of method-based `.pipe()` calls, eliminates nested pipe compositions in favor of named helper functions, and removes curried function calls. These changes make the code easier to understand and debug while maintaining the same functionality.

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

- [#201](https://github.com/CodeForBreakfast/eventsourcing/pull/201) [`0f7cba1`](https://github.com/CodeForBreakfast/eventsourcing/commit/0f7cba1afa2808d6812f909707c052abcf2dc09b) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved type safety and code clarity by enforcing Match.tag() over Match.when() for discriminated union matching. The codebase now consistently uses Match.tag() when matching on \_tag discriminators, providing better type inference and clearer intent.

- [#185](https://github.com/CodeForBreakfast/eventsourcing/pull/185) [`5c27220`](https://github.com/CodeForBreakfast/eventsourcing/commit/5c2722029b72f69d23b3e0dd7ccdb46270158959) Thanks [@GraemeF](https://github.com/GraemeF)! - Renamed protocol message types to use `Protocol*` prefix for clearer layer separation. Protocol-level message types (`ProtocolCommand`, `ProtocolCommandResult`, `ProtocolEvent`, `ProtocolSubscribe`, `ProtocolIncoming`) are now clearly distinguished from the public Wire API (`WireCommand`) and transport layer (`TransportMessage`). This improves code clarity by making the internal protocol implementation details explicit.

- [#169](https://github.com/CodeForBreakfast/eventsourcing/pull/169) [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720) Thanks [@GraemeF](https://github.com/GraemeF)! - Modernized service definitions to use Effect-TS 2.3+ patterns. Services now use `Context.Tag` instead of `Effect.Tag` with inlined service shapes, providing better type inference and cleaner code. Generic services use the `Context.GenericTag` factory pattern for proper type parameter support.

  For most users, these are internal improvements with no breaking changes. If you're directly referencing service types (like `CommandRegistryService`), use `Context.Tag.Service<typeof ServiceName>` to extract the service type instead.

- [#203](https://github.com/CodeForBreakfast/eventsourcing/pull/203) [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4) Thanks [@GraemeF](https://github.com/GraemeF)! - Code quality improvements: All packages now follow stricter functional programming patterns by removing type assertions in Effect callbacks. The codebase uses proper Schema validation and runtime type checking instead of unsafe type casts, improving type safety and code reliability.

- [#179](https://github.com/CodeForBreakfast/eventsourcing/pull/179) [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.

- [#180](https://github.com/CodeForBreakfast/eventsourcing/pull/180) [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce documented justifications for all ESLint rule suppressions

  All `eslint-disable` comments now require a description explaining why the rule is being suppressed. This improves code maintainability by documenting the reasoning behind each exception to the linting rules.

- [#178](https://github.com/CodeForBreakfast/eventsourcing/pull/178) [`f4c06d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/f4c06d6430f61976ec9c28af38faac39f88800d1) Thanks [@GraemeF](https://github.com/GraemeF)! - Refactored pipe usage patterns to comply with simplified functional composition rules. All `pipe(fn(x), ...)` patterns have been converted to `pipe(x, fn, ...)` for better readability and consistency. This change also fixes Effect type signatures to properly use `never` instead of `unknown` in context parameters where appropriate.

- Updated dependencies [[`2b03f0f`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b03f0faea585e54ac3488f6f5f9c97629eb1222), [`e3a002a`](https://github.com/CodeForBreakfast/eventsourcing/commit/e3a002a8dabbc4a57c750d9d6aa760c7e5494caf), [`1a4b174`](https://github.com/CodeForBreakfast/eventsourcing/commit/1a4b1743ba8edd7bf1a359468bae5dc8218ddf43), [`4e9f8c9`](https://github.com/CodeForBreakfast/eventsourcing/commit/4e9f8c9711df00e01b0ab943dad67aa14d59df06), [`a6482b6`](https://github.com/CodeForBreakfast/eventsourcing/commit/a6482b69a1070b62654e63fb501fd6346413b50f), [`ae77963`](https://github.com/CodeForBreakfast/eventsourcing/commit/ae7796342df299997ece012b7090f1ce9190b0a4), [`8503302`](https://github.com/CodeForBreakfast/eventsourcing/commit/850330219126aac119ad10f0c9471dc8b89d773a), [`460784f`](https://github.com/CodeForBreakfast/eventsourcing/commit/460784fb8d0c31b1d5b4b122d73a4807e2ce9bbe), [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7), [`04e27b8`](https://github.com/CodeForBreakfast/eventsourcing/commit/04e27b86f885c7a7746580f83460de3be7bae1bb), [`abfb14d`](https://github.com/CodeForBreakfast/eventsourcing/commit/abfb14d261138b629a31a2b0f86bd17b77f56720), [`d2b1c32`](https://github.com/CodeForBreakfast/eventsourcing/commit/d2b1c329050725ad7dad65442514387972d1d1f4), [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b), [`b481714`](https://github.com/CodeForBreakfast/eventsourcing/commit/b4817141e319d830f10f1914b8a12935ed10fbf8)]:
  - @codeforbreakfast/eventsourcing-commands@0.4.0
  - @codeforbreakfast/eventsourcing-store@0.8.0
  - @codeforbreakfast/eventsourcing-transport@0.3.5

## 0.3.5

### Patch Changes

- [#154](https://github.com/CodeForBreakfast/eventsourcing/pull/154) [`ac00ba4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac00ba4fc20800df3527541e8eebbeda61356c99) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplify arrow functions in pipe operations

  Removed unnecessary arrow functions that were just forwarding parameters to other functions, making the code cleaner and more readable. This includes simplifications like changing `(cmd) => sendCommand(cmd)` to just `sendCommand` and `(msg) => transport.publish(msg)` to `transport.publish`.

- [#150](https://github.com/CodeForBreakfast/eventsourcing/pull/150) [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4) Thanks [@GraemeF](https://github.com/GraemeF)! - Strengthen type immutability across all packages

  Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.
  - Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
  - Applied `ReadonlyDeep` to function parameters requiring deep immutability
  - Added `readonly` modifiers to arrays and interface properties
  - Strategic ESLint disable comments for Effect library types that require internal mutability

  These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.

- Updated dependencies [[`b1a2f97`](https://github.com/CodeForBreakfast/eventsourcing/commit/b1a2f9710bf40d879b1cbaa53ca001664d88f9df), [`6395dc3`](https://github.com/CodeForBreakfast/eventsourcing/commit/6395dc36c02168a7edce261f4270c8f1e0ba34c4)]:
  - @codeforbreakfast/eventsourcing-store@0.7.4
  - @codeforbreakfast/eventsourcing-commands@0.3.1
  - @codeforbreakfast/eventsourcing-transport@0.3.4

## 0.3.4

### Patch Changes

- Updated dependencies [[`f64ebb8`](https://github.com/CodeForBreakfast/eventsourcing/commit/f64ebb8a4e1f111e3e0f6bfed1be10c4e988436a)]:
  - @codeforbreakfast/eventsourcing-commands@0.3.0

## 0.3.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.3
  - @codeforbreakfast/eventsourcing-store@0.7.3
  - @codeforbreakfast/eventsourcing-transport@0.3.3

## 0.3.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-commands@0.2.2
  - @codeforbreakfast/eventsourcing-store@0.7.2
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
  - @codeforbreakfast/eventsourcing-commands@0.2.1
  - @codeforbreakfast/eventsourcing-store@0.7.1
  - @codeforbreakfast/eventsourcing-transport@0.3.1

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
