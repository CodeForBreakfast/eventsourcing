---
'@codeforbreakfast/eslint-effect': patch
---

Internal refactoring to reduce code duplication across ESLint rules. This change improves maintainability and consistency of rule implementations without affecting functionality or rule behavior.

**Changes:**

- Extracted common method call checking logic into a reusable `createMethodCallChecker` factory function
- Created shared utilities for common return type checks (`isNullReturn`, `isUndefinedReturn`, `isOptionSome`, `isVoidReturningFunction`)
- Refactored multiple rules to use shared utilities, reducing code duplication by 30-40% per rule
- Improved code consistency across rule implementations

**Rules refactored:**

- `prefer-get-or-null`
- `prefer-get-or-undefined`
- `prefer-as-some`
- `prefer-as-some-error`
- `prefer-zip-left`
- `prefer-zip-right`
- `prefer-ignore`

All rules maintain the same functionality and test coverage. No user-facing changes.
