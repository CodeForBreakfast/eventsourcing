---
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-aggregates': minor
---

Refactored package boundaries for better separation of concerns

- SQL/PostgreSQL implementation moved from `@codeforbreakfast/eventsourcing-store` to new `@codeforbreakfast/eventsourcing-store-postgres` package
  - Core package now only contains interfaces, types, and in-memory implementation
  - PostgreSQL users must now install `@codeforbreakfast/eventsourcing-store-postgres` separately
  - Import paths changed: `import { PostgresLive } from '@codeforbreakfast/eventsourcing-store-postgres'`

- Aggregates package no longer depends on projections package
  - Better separation between write-side and read-side concerns
  - Aggregates now use direct EventStore interface instead of projection adapters

- Added reusable test suite for EventStore implementations
  - Export `runEventStoreTestSuite` from core package for testing any EventStore implementation
  - Ensures consistent behavior across all implementations
