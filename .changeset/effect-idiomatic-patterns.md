---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Improve code quality by using idiomatic Effect patterns

The codebase now uses `Effect.andThen()` instead of `Effect.flatMap(() => ...)` when sequencing effects that don't need the previous result, and `Effect.as()` instead of `Effect.map(() => constant)` when replacing values with constants. These changes make the code more readable and better reflect the intent of each operation, following Effect.ts best practices.
