---
'@codeforbreakfast/eventsourcing-store-inmemory': patch
---

Enforce functional programming patterns through ESLint rules and refactor InMemoryStore

- Added ESLint rule to ban class declarations except for Effect-sanctioned patterns (service tags, error classes, and Schema classes)
- Refactored InMemoryStore from a class to a functional factory pattern following Effect library conventions
- The InMemoryStore API remains unchanged - this is an internal implementation improvement
