---
'@codeforbreakfast/eslint-effect': patch
---

Improved the `suggest-currying-opportunity` rule to be more conservative and avoid problematic suggestions:

- By default, the rule no longer suggests currying when it would require reordering parameters (which can break semantic ordering). This can be enabled with the `allowReordering` option.
- The rule now limits currying depth to single-level by default to prevent unreadable multi-level currying like `(a) => (b) => (c) => ...`. This can be configured with the `maxCurriedParams` option (max 3).
- Updated the rule message to be clearer about the benefits of currying in pipe contexts.

Fixed the `no-curried-calls` rule to properly catch all curried function call patterns:

- The rule now detects both member expression patterns (`Schema.decode()()`) and plain identifier patterns (`foo()()`).
- This works in tandem with `no-nested-pipe` to encourage extraction of named, composable functions instead of inline arrow functions with complex logic.
- Forces proper functional decomposition and creates reusable, testable function compositions.

These changes reduce false positives in the currying suggestion rule while strengthening enforcement of idiomatic Effect pipe composition patterns.
