---
'@codeforbreakfast/eventsourcing-commands': minor
---

Replace command handler registrations with Effect pattern matching for better type safety and exhaustive command handling. The new API uses Effect's `Match.exhaustive` to ensure all command types are handled at compile time, eliminating runtime handler lookups and providing stronger TypeScript inference within each match arm.

**Breaking Changes:**

- `createRegistration()` and registration-based API removed
- `makeCommandRegistry()` now takes `(commands, matcher)` instead of `registrations`
- `CommandHandler` interface replaced with functional pattern matching

**Migration:**
Replace handler registrations with a single matcher function using `Match.value()` and `Match.exhaustive` for compile-time command handling safety.
