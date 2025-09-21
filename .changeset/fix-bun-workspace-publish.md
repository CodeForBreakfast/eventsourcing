---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-websocket-transport': patch
---

Fix workspace protocol dependencies in published packages

The published packages incorrectly included `workspace:*` protocol in their dependencies, making them impossible to install outside the monorepo. This was caused by changesets not supporting Bun's workspace protocol.

The fix updates the release workflow to:

1. Run `bun update` after versioning to resolve workspace references
2. Use `bun publish` directly instead of `changeset publish`
3. Run `changeset tag` to create git tags after publishing

This ensures published packages have proper version constraints instead of workspace protocols.
