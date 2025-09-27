---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Fix WebSocket disconnection detection when server closes

Improved handling of server-initiated disconnections in WebSocket transport. Clients now properly receive 'disconnected' state notifications when the server shuts down. This ensures applications can detect and respond to connection loss appropriately.
