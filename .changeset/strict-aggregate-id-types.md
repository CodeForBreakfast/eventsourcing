---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Enforce strict branded ID types throughout aggregate root operations. The `load()` and `commit()` functions now require explicitly typed aggregate IDs instead of accepting plain strings. Event metadata schema now correctly includes the `originator` field with proper type safety. This prevents accidental use of unvalidated string IDs and ensures compile-time enforcement of branded types like `UserId` or `OrderId` throughout the aggregate lifecycle.
