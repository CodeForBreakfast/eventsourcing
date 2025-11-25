---
'@codeforbreakfast/bun-test-effect': minor
---

Rename package from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect` and prepare for public npm release.

**Migration:** Update your imports from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect`.

This release makes the package publicly available on npm with:

- Effect-aware test runners (`it.effect`, `it.scoped`, `it.live`, `it.scopedLive`)
- Layer sharing across tests with `it.layer()`
- Effect-native assertions (`expectSome`, `expectNone`, `expectRight`, `expectLeft`, `assertEqual`)
- ESLint rules for Effect testing best practices
- Silent logger utility for suppressing test output
