---
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
---

Build and test against Effect 3.22.

`eventsourcing-store-postgres` now depends on `@effect/sql` 0.52, `@effect/sql-pg` 0.53 and `@effect/experimental` 0.61. `eventsourcing-transport-websocket` now depends on `@effect/platform` 0.97.

In `eventsourcing-testing-contracts`, the test helpers fail with Effect's tagged errors instead of a plain `Error`. `expectError` fails with `NoSuchElementException` when the error does not match the predicate. `waitForConnectionState` and `collectMessages` fail with `TimeoutException` when they time out. The declared error type is still `Error`, so existing code compiles unchanged, and you can now match these failures by `_tag`.
