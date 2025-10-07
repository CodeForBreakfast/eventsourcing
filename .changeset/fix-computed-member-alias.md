---
'@codeforbreakfast/eslint-effect': patch
---

Fix no-unnecessary-function-alias rule to allow computed member expressions

The rule now correctly excludes aliases for computed member expressions (bracket notation) like `const firstEvent = events[0]` or `const command = args[0]`. These aliases provide semantic value by giving meaningful names to array/object access patterns and should not be flagged as unnecessary.
