# @codeforbreakfast/eventsourcing-transport-inmemory

## 0.2.0

### Minor Changes

- [#67](https://github.com/CodeForBreakfast/eventsourcing/pull/67) [`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5) Thanks [@GraemeF](https://github.com/GraemeF)! - Complete refactor of transport layer with proper layered architecture

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

### Patch Changes

- Updated dependencies [[`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5)]:
  - @codeforbreakfast/eventsourcing-transport-contracts@0.2.0
