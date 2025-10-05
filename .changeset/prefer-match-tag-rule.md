---
'@codeforbreakfast/eventsourcing-protocol': patch
---

Improved type safety and code clarity by enforcing Match.tag() over Match.when() for discriminated union matching. The codebase now consistently uses Match.tag() when matching on \_tag discriminators, providing better type inference and clearer intent.
