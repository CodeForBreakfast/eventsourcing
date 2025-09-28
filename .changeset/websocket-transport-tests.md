---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Add comprehensive test coverage for WebSocket transport

- Added unit tests for connection lifecycle including state transitions and delayed connections
- Added tests for error scenarios including connection failures, timeouts, and connection refused
- Added tests for message handling including delivery, malformed JSON filtering, and subscription filters
- Added tests for publishing constraints when connected or disconnected
- Implemented mock WebSocket for deterministic testing without real network connections
