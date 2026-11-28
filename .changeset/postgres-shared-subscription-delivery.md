---
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-store': patch
---

Fix duplicate events in the PostgreSQL store when one store has several subscribers. Each `subscribe` call on a stream used to start another LISTEN on that stream's channel, so with two subscribers every event reached each of them twice, and with three, three times. Each subscriber now receives each event once, however many subscribe to the same stream. `subscribeAll` shares one LISTEN the same way.

A LISTEN now runs until the store's layer is released, rather than ending when the call that started it ends. `NotificationListener.unlisten` and `unlistenAll` still do not stop a LISTEN, as before.

`runEventStoreTestSuite` gains a test that subscribes twice to one stream on one store and checks each subscriber gets each event exactly once. An adapter that delivers an event more than once to a subscriber now fails the suite.
