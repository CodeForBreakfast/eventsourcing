---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Refactored test utilities to use Effect.sleep instead of setTimeout for more consistent and testable async behavior. This change only affects test code and does not impact public APIs.
