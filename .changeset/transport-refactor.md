---
'@codeforbreakfast/eventsourcing-protocol-default': minor
'@codeforbreakfast/eventsourcing-transport-contracts': minor
'@codeforbreakfast/eventsourcing-transport-inmemory': minor
'@codeforbreakfast/eventsourcing-transport-websocket': minor
'@codeforbreakfast/eventsourcing-testing-contracts': minor
'@codeforbreakfast/eventsourcing-websocket': minor
---

Complete refactor of transport layer with proper layered architecture

### Transport & Protocol Improvements

- **New simplified transport contracts** - Minimal Client/Server namespaces with clean separation of concerns
- **Protocol layer separation** - Clear boundary between data transport and business logic
- **Functional Effect-based design** - Replaced 3900+ lines of OOP with functional primitives
- **Zero global state** - All state properly managed through Effect refs

### New Packages

- `@codeforbreakfast/eventsourcing-protocol-default` - Simplified protocol implementation with client/server logic
- `@codeforbreakfast/eventsourcing-testing-contracts` - Reusable contract tests for transport implementations

### Breaking Changes

- Removed `eventsourcing-protocol-contracts` package (merged into protocol-default)
- WebSocket transport completely rewritten with new API
- Transport implementations now use Effect.Tag pattern consistently

### Testing Improvements

- 2000+ lines of comprehensive protocol tests
- Contract-based testing for all transport implementations
- Type-safe schema validation throughout

### Developer Experience

- Added `bun run ci` command for local CI validation
- Simplified API surface with better type inference
- Consistent error handling across all packages
