---
'@codeforbreakfast/eventsourcing-store-postgres': patch
---

Fix lost events on new subscriptions. An event appended after `subscribe` or `subscribeAll` returned, but before the returned stream started running, could fail to reach the subscriber. A `subscribe` stream now delivers every event appended after the call returns exactly once, whenever you start running it.

A `subscribeAll` stream delivers what was published since the call returned from a buffer of the 1024 most recent events. If you start running it after more events than that, it loses the oldest of them and logs a warning.
