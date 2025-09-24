---
'@codeforbreakfast/eventsourcing-websocket': patch
---

Add ESLint rule to prevent .js extensions in imports and fix existing violation

**Improvements:**

- Added `import/extensions` ESLint rule configured to disallow `.js`, `.ts`, and `.tsx` extensions in import statements
- Fixed existing violation in `@codeforbreakfast/eventsourcing-websocket` where `./lib/index.js` import incorrectly included `.js` extension
- Added `eslint-plugin-import` dependency to support the new linting rule

This change helps maintain consistency with TypeScript/Bun configuration where source files don't need file extensions in imports, preventing future accidental additions of unnecessary extensions.
