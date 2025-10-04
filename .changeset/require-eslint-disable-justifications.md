---
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Enforce documented justifications for all ESLint rule suppressions

All `eslint-disable` comments now require a description explaining why the rule is being suppressed. This improves code maintainability by documenting the reasoning behind each exception to the linting rules.
