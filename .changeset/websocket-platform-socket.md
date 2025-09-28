---
'@codeforbreakfast/eventsourcing-transport-websocket': minor
---

Refactored WebSocket transport to use @effect/platform/Socket abstraction

**Breaking Changes:**

- The WebSocket transport now uses the @effect/platform/Socket module instead of raw WebSocket API
- Connection error handling has been improved with better Effect-based lifecycle management
- The transport now properly manages resources using Effect's Scope

**Benefits:**

- Better integration with Effect ecosystem
- Improved error handling and resource cleanup
- Proper structured concurrency for WebSocket connections
- More robust connection state management

**Migration:**
No changes required for consumers - the public API remains the same. The transport continues to implement the standard Client.Transport interface.
