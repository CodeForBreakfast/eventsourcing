---
'@codeforbreakfast/eventsourcing-store': patch
---

`runEventStoreTestSuite` now checks that `subscribe` and `subscribeAll` deliver every event appended after the call returns, exactly once and in order, even when the returned stream starts running later. A store that subscribes to its live feed only when the stream runs will now fail these tests.
