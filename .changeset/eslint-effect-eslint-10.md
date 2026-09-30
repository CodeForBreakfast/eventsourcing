---
'@codeforbreakfast/eslint-effect': patch
---

The rules now run under ESLint 10. Before this, ESLint 10 stopped with "context.getSourceCode is not a function" as soon as it loaded one of them.

The `eslint` peer dependency is now `>=8.40.0` instead of `>=8.0.0`. ESLint 8.40 is the first release with `context.sourceCode`, which the rules now use. One rule already needed it, so the plugin did not fully work on older ESLint 8 releases anyway. If you are on ESLint 8.40 or later, there is nothing to change on your side.
