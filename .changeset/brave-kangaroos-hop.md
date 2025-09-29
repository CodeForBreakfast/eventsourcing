---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Remove blanket eslint-disable and fix functional programming violations

Replaced file-wide eslint-disable comments with properly typed code that satisfies functional programming rules. The mock WebSocket implementation in tests now uses immutable patterns where possible while maintaining necessary test functionality.
