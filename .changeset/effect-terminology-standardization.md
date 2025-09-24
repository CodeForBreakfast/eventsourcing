---
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-projections': minor
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-testing-contracts': minor
'@codeforbreakfast/eventsourcing-transport-inmemory': minor
'@codeforbreakfast/eventsourcing-transport-websocket': minor
'@codeforbreakfast/eventsourcing-websocket': minor
---

Standardize API naming to follow Effect conventions

Eliminate duplicate APIs and ensure consistent Effect terminology throughout the codebase. All factory functions now use the Effect `make*` convention, and redundant aliases have been removed for a cleaner API surface.

- Replace `create*` factory functions with `make*` (Effect convention)
- Update WebSocket layer terminology (`createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`)
- Remove backward compatibility aliases and redundant exports
- Standardize all test interface methods to use Effect naming patterns

This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.
