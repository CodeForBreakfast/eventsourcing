---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Internal typing fix so the WebSocket server passes the stricter immutability checks in `eslint-plugin-functional` 10. There is nothing to change on your side: runtime behaviour and the public API are the same.
