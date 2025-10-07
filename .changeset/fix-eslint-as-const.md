---
'@codeforbreakfast/eslint-effect': patch
---

Fix `prefer-schema-validation-over-assertions` rule to allow safe `as const` type assertions. The rule now correctly distinguishes between unsafe type casts (which should use Schema validation) and safe const assertions used for literal type narrowing in discriminated unions.
