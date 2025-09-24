---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Refactor existing tests to use @codeforbreakfast/buntest package

This change improves the testing experience by:

- Converting manual Effect.runPromise calls to Effect-aware test runners (it.effect, it.live, it.scoped)
- Adding proper scoped resource management for transport lifecycle tests
- Using Effect-specific assertions and custom equality matchers for Effect types
- Leveraging automatic TestServices provision (TestClock, etc.) in effect tests
- Implementing cleaner layer sharing patterns where appropriate
- Reducing test boilerplate and improving readability

All existing tests continue to pass while providing a better developer experience for Effect-based testing.
