---
'@codeforbreakfast/buntest': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Fix turbo cache invalidation for lint tasks to ensure CI properly detects code changes

- Simplified lint task input patterns to prevent cache inconsistencies
- Added tracking for root package.json and bun.lock to invalidate cache when dependencies change
- Added missing TSX test file patterns to ensure all test files are tracked
- Removed duplicate and non-existent file patterns that were causing unreliable cache behavior

This ensures that lint errors are always caught in CI and prevents false-positive builds from stale cache.
