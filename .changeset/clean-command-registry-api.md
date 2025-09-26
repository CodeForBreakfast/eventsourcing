---
'@codeforbreakfast/eventsourcing-commands': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol': patch
---

Implement immutable command registry with compile-time exhaustive command name validation. The new system provides complete type safety for command dispatch while maintaining clean API design.

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
