---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-filesystem': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
---

Widen `@effect/platform` peer dependency range from explicit minor versions to `>=0.90.0 <1.0.0`.

This makes the packages more consumer-friendly by automatically supporting new Effect platform releases without requiring a library update, while still maintaining compatibility with versions 0.90.0 and above.
