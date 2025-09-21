---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-projections': patch
---

Update to work with simplified EventStore API

- Updated to use `read()` instead of `readHistorical()` for loading aggregate state
- Projections package now correctly maps legacy `readHistorical` calls to new `read()` method
- Both packages maintain backward compatibility while using the new simplified API internally
