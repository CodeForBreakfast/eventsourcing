---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-filesystem': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-server': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Widen `@effect/platform` peer dependency range from explicit minor versions to `>=0.90.0 <1.0.0`.

This makes the packages more consumer-friendly by automatically supporting new Effect platform releases without requiring a library update, while still maintaining compatibility with versions 0.90.0 and above.
