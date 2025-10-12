---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Fix TypeScript type errors in WebSocket server upgrade calls.

Made `clientId` optional in `WebSocketData` interface since it's assigned after the WebSocket connection is established in the `open` handler, not during the `upgrade()` call. Added guard clauses in `message` and `close` handlers to ensure `clientId` is defined before use.

This resolves type errors that surfaced with stricter Bun type definitions while maintaining type safety.
