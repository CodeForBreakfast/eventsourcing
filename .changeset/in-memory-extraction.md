---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-inmemory': minor
---

Extract in-memory EventStore implementation into separate package

The in-memory EventStore implementation has been moved from `@codeforbreakfast/eventsourcing-store` to its own dedicated `@codeforbreakfast/eventsourcing-store-inmemory` package for better architectural separation.

**Benefits:**

- **Cleaner Architecture**: Core package contains only abstractions and interfaces
- **Better Modularity**: In-memory implementation is self-contained with its own documentation
- **Improved Separation**: Clear boundaries between core types and specific implementations
- **Enhanced Maintainability**: Each package has focused responsibilities
