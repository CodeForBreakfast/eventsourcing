---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol-default': patch
---

Improve package architecture and domain type organization

**Breaking changes for `@codeforbreakfast/eventsourcing-store`:**

- Added new domain types `Command`, `Event`, and `CommandResult` schemas that were previously only available in the protocol package
- These core domain types are now available directly from the store package for better separation of concerns

**Improvements for `@codeforbreakfast/eventsourcing-aggregates`:**

- Fixed architectural violation by removing dependency on protocol implementation
- Aggregate roots now only depend on store abstractions, creating cleaner layer separation
- Import domain types directly from store package instead of protocol package

**Improvements for `@codeforbreakfast/eventsourcing-protocol-default`:**

- Domain types (`Command`, `Event`, `CommandResult`) are now imported from store package and re-exported for convenience
- Maintains backward compatibility while improving architectural boundaries

This change establishes cleaner separation between domain concepts (in store) and transport protocols, making the packages more modular and easier to understand.
