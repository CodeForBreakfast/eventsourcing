---
'@codeforbreakfast/eslint-effect': minor
---

Added `no-if-statement` rule to enforce declarative control flow patterns in functional Effect code.

This new rule forbids all `if` statements, encouraging developers to use more composable alternatives:

- `Effect.if` for boolean conditionals returning Effects
- `Match.value` for pattern matching on discriminated unions
- Type-specific matchers like `Option.match`, `Either.match`, `Exit.match`
- Ternary operators for simple value selection

The rule is included in the `strict` and `preferMatch` configurations, providing exhaustiveness checking and better functional composition compared to imperative if statements.

**Breaking change for `strict` config users**: Code using if statements will now be flagged as errors. Migrate to declarative patterns using the alternatives listed above.
