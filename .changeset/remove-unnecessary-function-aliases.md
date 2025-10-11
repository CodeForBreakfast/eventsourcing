---
'@codeforbreakfast/buntest': minor
'@codeforbreakfast/eslint-effect': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-filesystem': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Add Effect-native assertions and new ESLint rules

**New Features:**

- **buntest**: Added Effect-native assertion utilities (`expectEffect`, `toSucceedWith`, `toFailWith`) and a new ESLint rule `prefer-effect-assertions` to enforce their usage
- **eslint-effect**: Added two new rules: `no-effect-if-option-check` and `prefer-get-or-undefined`

**Bug Fixes & Improvements:**

- Replaced `Effect.sync(expect())` patterns with Effect-native assertions across test suites
- Removed unnecessary function aliases to improve code readability
- Fixed nested pipe calls and redundant Effect.sync wrappers
