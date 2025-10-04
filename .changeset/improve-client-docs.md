---
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Improved client documentation to emphasize transport abstraction.

The documentation now clearly shows:

- Protocol package provides transport-agnostic API (`sendWireCommand`, `subscribe`)
- WebSocket package is used only for creating Effect layers
- Application code should be written against protocol abstractions
- Transport choice (WebSocket, HTTP, etc.) is configured once when setting up layers

This makes it easier to:

- Write transport-independent application code
- Switch transports without changing application logic
- Understand the proper separation between layers
