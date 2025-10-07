---
'@codeforbreakfast/eslint-effect': patch
---

Improved the `suggest-currying-opportunity` rule to be more conservative and avoid problematic suggestions:

- By default, the rule no longer suggests currying when it would require reordering parameters (which can break semantic ordering). This can be enabled with the `allowReordering` option.
- The rule now limits currying depth to single-level by default to prevent unreadable multi-level currying like `(a) => (b) => (c) => ...`. This can be configured with the `maxCurriedParams` option (max 3).
- Updated the rule message to be clearer about the benefits of currying in pipe contexts.

These changes reduce false positives and make the rule's suggestions more practical while still encouraging good functional programming patterns.
