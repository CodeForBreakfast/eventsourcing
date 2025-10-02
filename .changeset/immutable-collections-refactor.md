---
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Internal refactoring to use immutable collections from Effect

Replaced mutable data structures with Effect's immutable HashSet and Chunk collections for better functional programming practices. This is an internal implementation change with no impact on the public API or behavior.
