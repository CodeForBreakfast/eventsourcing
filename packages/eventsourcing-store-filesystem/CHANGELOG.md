# @codeforbreakfast/eventsourcing-store-filesystem

## 0.2.0

### Minor Changes

- [#247](https://github.com/CodeForBreakfast/eventsourcing/pull/247) [`75a1402`](https://github.com/CodeForBreakfast/eventsourcing/commit/75a140291015876f34014f264f2d3718bda5fb65) Thanks [@GraemeF](https://github.com/GraemeF)! - Add filesystem-based event store implementation for learning and debugging

  This new package provides a simple filesystem-based event store that stores events as human-readable JSON files. Each stream gets its own directory, and events are stored as sequentially numbered files (0.json, 1.json, etc.).

  **Features:**
  - Human-readable JSON storage format
  - Stream-based directory organization
  - Full EventStore interface implementation
  - Concurrency conflict detection
  - Perfect for understanding event sourcing concepts

  **Limitations:**
  - Not recommended for production use
  - Live subscriptions work only within a single process (uses in-memory PubSub)
  - Performance not optimized for large event volumes

  This implementation is ideal for:
  - Learning event sourcing concepts
  - Debugging event streams by inspecting files directly
  - Quick prototyping
  - Educational demonstrations

  For production use, consider `@codeforbreakfast/eventsourcing-store-postgres` or `@codeforbreakfast/eventsourcing-store-inmemory` for testing.

### Patch Changes

- Updated dependencies []:
  - @codeforbreakfast/eventsourcing-store@0.8.2
