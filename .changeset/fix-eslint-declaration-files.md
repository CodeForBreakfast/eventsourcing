---
'@codeforbreakfast/buntest': patch
'@codeforbreakfast/eslint-effect': patch
---

Fixed ESLint configuration to properly handle TypeScript declaration files. This resolves parsing errors that occurred when ESLint attempted to parse generated `.d.ts` files that were not included in TypeScript project configurations.
