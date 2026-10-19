---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-store': patch
---

The event store test suite and the command processing example now pass lint under typescript-eslint 8.71.2. Their example events are plain types rather than types derived from schemas that were never used at runtime. Nothing changes in what either package exports or does.
