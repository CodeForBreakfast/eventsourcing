---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
'@codeforbreakfast/buntest': patch
---

Improve development workflow with enhanced validation scripts

Enhanced the internal validation and release preparation scripts to use modern Turbo-based architecture. Package validation is now faster and more reliable thanks to improved caching and parallel execution. The validation process now properly separates discovery, orchestration, and execution concerns for better maintainability.

Changes are purely internal to the development workflow and do not affect the public API or runtime behavior of any packages.
