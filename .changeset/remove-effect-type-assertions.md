---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Code quality improvements: All packages now follow stricter functional programming patterns by removing type assertions in Effect callbacks. The codebase uses proper Schema validation and runtime type checking instead of unsafe type casts, improving type safety and code reliability.
