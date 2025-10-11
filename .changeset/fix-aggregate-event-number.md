---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Fixed a critical bug where aggregate event numbers were not correctly tracked when loading aggregates from the event store. Previously, the `nextEventNumber` was always reset to 0 during event replay, causing concurrency conflicts when attempting to commit new events. Aggregates now correctly maintain their event position after loading, ensuring proper optimistic concurrency control.
