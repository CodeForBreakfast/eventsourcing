---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Enhanced type safety throughout aggregate roots and event handling. The `makeAggregateRoot` function now returns a properly typed `AggregateRoot` interface that preserves command handler types, eliminating the need for unsafe type assertions in consumer code. This improvement allows TypeScript to verify command usage at compile time and prevents runtime type errors.

**Improvements:**

- `makeAggregateRoot` now returns `AggregateRoot<TId, TState, TEvent, TInitiator, TCommands, TTag>` interface
- Command handlers maintain their specific return types through the aggregate root
- Removed internal `stripMetadata` function (structural typing makes it unnecessary)
