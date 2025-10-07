---
'@codeforbreakfast/eslint-effect': minor
---

The `no-switch-statement` rule (renamed from `no-switch-on-tag`) now forbids ALL switch statements in strict mode, not just switches on `_tag`. Switch statements are imperative and don't provide exhaustiveness checking. Use `Match.value` for type-safe, exhaustive pattern matching on discriminated unions instead.
