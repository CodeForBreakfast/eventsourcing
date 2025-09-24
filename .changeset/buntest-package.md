---
'@codeforbreakfast/buntest': minor
---

Add internal Effect testing utilities package adapted from @effect/vitest

- Port Effect testing framework to work exclusively with Bun test runner
- Includes it.effect, it.scoped, it.live testing methods for Effect workflows
- Layer sharing capabilities for test setup
- Custom equality testers for Effect types (Option, Either, Exit)
- Testing utilities for assertions and test data generation
- Flaky test retry functionality with configurable timeouts
