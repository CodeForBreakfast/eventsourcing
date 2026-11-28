---
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-store': patch
---

Fix duplicate events in the PostgreSQL store when one store has several subscribers. Each `subscribe` call on a stream used to start another LISTEN on that stream's channel, so with two subscribers every event reached each of them twice. Each subscriber now receives each event once, however many subscribe to the same stream. Subscribers on one channel share a single LISTEN, which ends when the last of them ends.

This also fixes `subscribeAll` on a store whose first `subscribeAll` caller had finished. That caller's LISTEN ended with it, and every later `subscribeAll` on the store silently received nothing.

`runEventStoreTestSuite` gains a test that subscribes twice to one stream on one store and checks each subscriber gets each event exactly once. An adapter that delivers an event more than once to a subscriber now fails the suite.
