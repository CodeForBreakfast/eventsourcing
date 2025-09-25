---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport-contracts': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Remove all vitest dependencies and references in favor of bun:test

All packages now use bun:test instead of vitest for testing. This change removes vitest as a dependency across all packages while maintaining the same testing functionality. Test imports have been updated from 'vitest' to 'bun:test' and configuration files have been cleaned up to remove vitest references.
