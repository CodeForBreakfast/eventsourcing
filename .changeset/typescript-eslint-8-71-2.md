---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-store': patch
---

Internal tidy-up for typescript-eslint 8.71.2, which now reports a schema constant that is only ever used for its type. The shared event store test suite and the command processing example declare their event types directly instead. Nothing you import changes.
