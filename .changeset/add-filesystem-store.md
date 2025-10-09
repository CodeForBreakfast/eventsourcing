---
'@codeforbreakfast/eventsourcing-store-filesystem': minor
---

Add filesystem-based event store implementation for learning and debugging

This new package provides a simple filesystem-based event store that stores events as human-readable JSON files. Each stream gets its own directory, and events are stored as sequentially numbered files (0.json, 1.json, etc.).

**Features:**

- Human-readable JSON storage format
- Stream-based directory organization
- Full EventStore interface implementation
- Concurrency conflict detection
- Perfect for understanding event sourcing concepts

**Limitations:**

- Not recommended for production use
- No live subscription support (historical reads only)
- Performance not optimized for large event volumes

This implementation is ideal for:

- Learning event sourcing concepts
- Debugging event streams by inspecting files directly
- Quick prototyping
- Educational demonstrations

For production use, consider `@codeforbreakfast/eventsourcing-store-postgres` or `@codeforbreakfast/eventsourcing-store-inmemory` for testing.
