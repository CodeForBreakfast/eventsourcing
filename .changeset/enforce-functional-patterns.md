---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Enforce functional programming patterns with stricter ESLint rules

## Changes

- **Classes are now forbidden** except for Effect library patterns (Data.TaggedError, Effect.Tag, Context.Tag, Context.GenericTag, Schema.Class)
- **Effect.gen is now forbidden** - all code must use pipe-based composition with Effect.all and Effect.forEach
- Fixed test code to comply with functional programming patterns by replacing classes with factory functions
- Refactored Effect.gen usage to pipe-based functional composition

These changes enforce a more consistent functional programming style across the codebase, improving maintainability and reducing cognitive overhead when working with Effect.
