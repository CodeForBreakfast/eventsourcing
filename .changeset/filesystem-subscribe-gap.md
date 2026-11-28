---
'@codeforbreakfast/eventsourcing-store-filesystem': patch
---

Fix lost events on new subscriptions. An event appended after `subscribe` or `subscribeAll` returned, but before the returned stream started running, never reached the subscriber. A `subscribe` stream now delivers every event appended after the call returns exactly once, whenever you start running it.

A `subscribeAll` stream delivers what was published since the call returned from a buffer of the 1024 most recent events. If you start running it after more events than that, it loses the oldest of them and logs a warning.

Appends to the same store now run one at a time. A subscriber that falls 256 events behind therefore stalls appends to every stream in the store until it catches up, not only appends to its own stream.
