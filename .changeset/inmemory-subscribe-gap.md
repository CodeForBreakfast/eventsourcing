---
'@codeforbreakfast/eventsourcing-store-inmemory': patch
---

Fix lost events on new subscriptions. An event appended after `subscribe` or `subscribeAll` returned, but before the returned stream started running, never reached the subscriber. A subscription now delivers every event appended after the call returns, whenever you start running its stream.

`InMemoryStore.get`, `getAll` and `getAllLiveOnly` get the same fix.
