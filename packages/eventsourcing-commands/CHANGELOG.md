# @codeforbreakfast/eventsourcing-commands

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
