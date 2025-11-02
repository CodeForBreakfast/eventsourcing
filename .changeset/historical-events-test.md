---
'@codeforbreakfast/eventsourcing-server': patch
---

Add test coverage for historical events before EventBus layer creation. Verifies that events written to the store before the EventBus layer exists are not delivered to subscribers.
