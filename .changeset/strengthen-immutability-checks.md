---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Strengthen type immutability across all packages

Added comprehensive immutability checks using ESLint's functional programming rules to enforce readonly types throughout the codebase. This improves type safety by preventing accidental mutations of parameters and return values.

- Added `type-fest` dependency where needed for `ReadonlyDeep` utility type
- Applied `ReadonlyDeep` to function parameters requiring deep immutability
- Added `readonly` modifiers to arrays and interface properties
- Strategic ESLint disable comments for Effect library types that require internal mutability

These changes ensure better type safety without affecting runtime behavior or breaking existing APIs.
