---
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Refactored pipe usage patterns to comply with simplified functional composition rules. All `pipe(fn(x), ...)` patterns have been converted to `pipe(x, fn, ...)` for better readability and consistency. This change also fixes Effect type signatures to properly use `never` instead of `unknown` in context parameters where appropriate.
