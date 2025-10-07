---
'@codeforbreakfast/eslint-effect': minor
---

Added two new ESLint rules to enforce functional programming best practices:

- `no-eta-expansion` - Detects unnecessary function wrappers (eta-expansion) that only pass parameters directly to another function. Encourages point-free style by flagging patterns like `(x) => fn(x)` which can be simplified to just `fn`. This helps reduce code noise and improve readability in functional compositions.

- `no-unnecessary-function-alias` - Detects unnecessary function aliases that provide no semantic value. When a constant is assigned directly to another function without adding clarity or abstraction, it should be inlined at the call site. The rule is configurable with a `maxReferences` option to allow aliases that improve code reuse.

Both rules are included in the recommended configuration and support ESLint's disable comments for legitimate use cases where the expanded form adds necessary clarity.
