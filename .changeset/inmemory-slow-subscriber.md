---
'@codeforbreakfast/eventsourcing-store-inmemory': patch
---

Fix appends stalling behind a slow subscriber. The store sized its subscription buffers with `2 ^ 8`, which is 10 in JavaScript, so a subscriber ten events behind blocked `append` while it held the store lock. A consumer that appended to a stream it was subscribed to could deadlock.

Subscription buffers are now unbounded, so `append` never waits for a subscriber. A subscriber that never drains now grows memory instead of stalling appends.
