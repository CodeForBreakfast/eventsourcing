---
'@codeforbreakfast/eslint-effect': minor
---

Added new `prefer-effect-if-over-match-boolean` lint rule that enforces using `Effect.if` for boolean conditionals instead of `Match.value`. This rule helps distinguish between simple boolean branching (where `Effect.if` is clearer) and true pattern matching scenarios (where `Match.value` excels). Updated the `prefer-match-over-ternary` rule to work harmoniously with this new rule, focusing on non-boolean pattern matching use cases.
