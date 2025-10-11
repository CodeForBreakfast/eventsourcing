---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-example-todo': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Updated internal implementation to comply with `no-if-statement` rule.

Test code now uses if statements where appropriate (for assertions and side effects), while production code follows functional patterns. This is an internal refactoring with no API changes.
