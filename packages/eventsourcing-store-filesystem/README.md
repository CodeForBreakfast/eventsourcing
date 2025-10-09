# @codeforbreakfast/eventsourcing-store-filesystem

Filesystem-based event store implementation for learning and debugging. Stores events as human-readable JSON files organized by stream.

## Features

- **Human-readable storage**: Events stored as formatted JSON files
- **Stream isolation**: Each stream gets its own directory
- **Sequential naming**: Events named by position (0.json, 1.json, etc.)
- **Easy inspection**: Open files in any text editor to see events
- **Full EventStore interface**: Compatible with all eventsourcing packages

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-store-filesystem
```

## Usage

```typescript
import { make, makeFileSystemEventStore } from '@codeforbreakfast/eventsourcing-store-filesystem';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Layer, Effect, pipe } from 'effect';

const program = pipe(
  make({ baseDir: './event-data' }),
  Effect.flatMap(makeFileSystemEventStore),
  Effect.provide(BunFileSystem.layer),
  Effect.provide(BunPath.layer)
);

const eventStore = await Effect.runPromise(program);
```

## Directory Structure

The store creates a simple directory structure:

```
event-data/
  stream-1/
    0.json
    1.json
    2.json
  stream-2/
    0.json
    1.json
```

Each event is stored as a formatted JSON file, making it easy to inspect and understand the event stream.

## Example Event File

```json
{
  "type": "UserCreated",
  "userId": "123",
  "name": "John Doe",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Performance Considerations

This implementation is designed for **learning and debugging**, not production use:

- Each event is a separate file (can be slow with many events)
- No caching or optimization
- Simple concurrency control via file count checks
- No live subscriptions (subscribe returns historical events only)

For production use, consider:

- `@codeforbreakfast/eventsourcing-store-inmemory` (for testing)
- `@codeforbreakfast/eventsourcing-store-postgres` (for production)

## Use Cases

- Learning event sourcing concepts
- Debugging event streams
- Understanding event store behavior
- Quick prototyping
- Educational demonstrations

## License

MIT
