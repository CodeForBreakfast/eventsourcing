---
'@codeforbreakfast/eventsourcing-commands': minor
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-protocol': patch
---

Separate CQRS command types into dedicated package for better architecture

**New Package: `@codeforbreakfast/eventsourcing-commands`**

- Introduces a dedicated package for CQRS command types and schemas
- Contains `Command` and `CommandResult` schemas that were previously in the store package
- Establishes proper separation between domain concepts (commands) and event storage
- Includes comprehensive test coverage and documentation

**Breaking changes for `@codeforbreakfast/eventsourcing-store`:**

- Removed `Command` and `CommandResult` types - these are now in the commands package
- Store package now focuses purely on event streaming and storage concepts
- Updated description to reflect pure event streaming focus

**Updated packages:**

- `@codeforbreakfast/eventsourcing-aggregates`: Updated to import command types from commands package
- `@codeforbreakfast/eventsourcing-protocol-default`: Updated to import command types from commands package

This change establishes cleaner architectural boundaries:

- **Store**: Pure event streaming and storage
- **Commands**: CQRS command types and schemas
- **Aggregates**: Domain modeling (uses both events and commands)
- **Protocol**: Transport implementation (uses both events and commands)
