---
'@codeforbreakfast/eslint-effect': minor
---

Added `no-intermediate-effect-variables` rule to detect single-use intermediate variables in pipe chains. The rule encourages composing Effect/Stream/pipe operations in a single chain for better readability, while allowing variables that are genuinely reused multiple times. The rule is smart enough to exclude execution results (`runSync`, `runPromise`) and factory methods (`Schema.decode`) which return plain values or functions rather than Effects. This rule is included in the `pipeStrict` config preset.
