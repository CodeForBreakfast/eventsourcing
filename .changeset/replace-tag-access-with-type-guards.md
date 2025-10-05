---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol': patch
---

Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.
