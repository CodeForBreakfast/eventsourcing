---
'@codeforbreakfast/eslint-effect': patch
---

Improved `no-intermediate-effect-variables` rule to use pipe position as semantic clue

The rule now distinguishes between intermediate pipeline values and configuration data based on where variables are used. Variables passed as the first argument to `pipe()` are considered intermediate values that should be inlined. Variables used in other positions (like `Effect.retry(schedule)` or `Effect.zipWith(effect, ...)`) are treated as legitimate configuration data and are not flagged.

This eliminates false positives for common patterns like extracting Schedule configurations, retry policies, or Effect values used as parameters to Effect operations.
