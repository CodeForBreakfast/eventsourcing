---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Improved WebSocket transport testing approach

- Removed problematic global state mocking that violated test isolation
- Documented testing options including @effect/platform/Socket for future improvements
- Simplified test suite to focus on testable scenarios without mocking
- Integration tests continue to provide coverage for main functionality
