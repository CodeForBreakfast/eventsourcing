---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-server': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-filesystem': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
'@codeforbreakfast/bun-test-effect': patch
'@codeforbreakfast/eslint-effect': patch
---

Update Effect ecosystem dependencies to latest versions:

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
