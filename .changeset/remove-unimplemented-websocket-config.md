---
'@codeforbreakfast/eventsourcing-websocket': minor
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Remove unimplemented WebSocket configuration options and update documentation

**Breaking Changes for @codeforbreakfast/eventsourcing-websocket:**

- Removed unused `DefaultWebSocketConfig` export
- Removed unused `WebSocketConnectOptions` interface
- Removed unused `WebSocketEventSourcingInfo` export
- Simplified `connect()` function to only accept URL parameter

**Improvements:**

- Updated README to reflect actual implementation status rather than aspirational roadmap
- Removed misleading "TDD placeholder" comment from WebSocket server implementation
- Cleaned up test files to remove references to deleted configuration options

These configuration options were never actually used by the implementation and provided no functionality. The WebSocket packages are fully implemented and ready for use.
