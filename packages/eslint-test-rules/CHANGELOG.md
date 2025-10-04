# @codeforbreakfast/eslint-test-rules

## 0.0.2

### Patch Changes

- [#179](https://github.com/CodeForBreakfast/eventsourcing/pull/179) [`02f67ff`](https://github.com/CodeForBreakfast/eventsourcing/commit/02f67ffe83a70fceebe5ee8d848e0a858529319b) Thanks [@GraemeF](https://github.com/GraemeF)! - Replace direct `_tag` property access with Effect type guards throughout the codebase. This change improves type safety and follows Effect's recommended patterns for working with discriminated unions. The transport packages now properly validate incoming messages using Schema validation instead of unsafe type casts.
