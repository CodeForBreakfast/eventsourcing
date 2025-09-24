---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol-default': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport-contracts': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Fix release pipeline failures caused by TypeScript build issues

The release process was failing because packages with `workspace:*` dependencies were rebuilding during publish via `prepublishOnly` hooks. This caused TypeScript compilation errors when dependent packages tried to build in parallel without access to their dependencies' declaration files.

**Solution:**

- Removed `prepublishOnly` hooks from all packages (turbo already handles build order correctly)
- Updated release script to use `changeset publish` directly instead of custom turbo publish tasks
- Ensured all packages are built in dependency order before publishing begins

This ensures a smooth release process where:

1. All packages build in correct dependency order (respecting workspace dependencies)
2. Changesets handles publishing with proper version resolution
3. No parallel rebuild issues during the publish phase
