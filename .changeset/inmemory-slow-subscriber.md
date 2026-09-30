---
'@codeforbreakfast/eventsourcing-store-inmemory': patch
---

Fix the subscription buffer size. The store meant to buffer 256 events per subscription but wrote `2 ^ 8`, which is 10 in JavaScript. A subscriber only ten events behind blocked `append`, and a consumer that appended to a stream it was subscribed to could deadlock.

The buffer is now 256. A subscriber that falls 256 events behind still blocks `append`. This is deliberate: the in-memory store is meant for tests and similar uses, where failing fast is better than growing memory without limit.
