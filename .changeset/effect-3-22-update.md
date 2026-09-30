---
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
---

Build and test against Effect 3.22.

`eventsourcing-store-postgres` now depends on `@effect/sql` 0.52, `@effect/sql-pg` 0.53 and `@effect/experimental` 0.61. `eventsourcing-transport-websocket` now depends on `@effect/platform` 0.97.

`eventsourcing-store-postgres` fixes lost events on new subscriptions. `subscribe` and `subscribeAll` used to return before Postgres `LISTEN` was active, so an event committed in that gap never reached the subscriber. They now wait until `LISTEN` is active. To detect that, the store sends probe notifications to the channel it is listening on, repeating every 10ms until one comes back. A probe payload starts with `eventstore_listen_probe:`, and every listener on that channel receives it. If your own code listens on the `eventstore_events_*` channels, ignore payloads with that prefix. Older versions of this package log a parse error for each probe they receive.

In `eventsourcing-testing-contracts`, the test helpers fail with Effect's tagged errors instead of a plain `Error`. `expectError` fails with `NoSuchElementException` when the error does not match the predicate. `waitForConnectionState` and `collectMessages` fail with `TimeoutException` when they time out. The declared error type is still `Error`, so existing code compiles unchanged, and you can now match these failures by `_tag`.
