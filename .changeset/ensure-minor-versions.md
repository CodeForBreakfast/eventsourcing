---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-inmemory': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Ensure pre-1.0 packages use minor version bumps instead of major

Updated changeset configurations to use minor version bumps as the maximum for all pre-1.0 packages, following semantic versioning best practices for pre-release versions. This ensures breaking changes are communicated through minor version increments rather than major version bumps while packages are still in initial development.