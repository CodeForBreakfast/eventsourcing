---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-websocket-transport': patch
---

Fix prepublishOnly script to maintain build dependency chain

The prepublishOnly script was doing a clean build (`clean && build`) which broke the dependency chain established by Turbo's build ordering. This caused packages that depend on other workspace packages to fail TypeScript compilation during publishing because their dependencies' TypeScript definitions weren't available.

Changed prepublishOnly from `bun run clean && bun run build` to just `bun run build` to maintain the build artifacts and dependency chain established by the main build process.
