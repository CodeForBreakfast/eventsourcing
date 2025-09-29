---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/buntest': patch
---

Simplified type definitions while strengthening type safety:

- Error classes no longer expose redundant static `is` methods - use built-in tag discrimination instead
- Improved type guard implementation using Effect's discriminated union pattern
- Test service definitions now use proper service interfaces instead of bare string literals
