# @codeforbreakfast/eventsourcing-store-inmemory

Fast in-memory event store implementation for development and testing. Provides a complete EventStore interface implementation with blazing-fast performance and zero external dependencies.

## Features

- ⚡ **Lightning Fast**: Pure in-memory storage with optimal performance
- 🧪 **Perfect for Testing**: Ideal for unit tests and development environments
- 🔒 **Type Safe**: Full TypeScript support with Effect-ts integration
- 🎯 **Complete Interface**: Implements all EventStore operations (append, read, subscribe)
- 💪 **Concurrency Safe**: Proper handling of concurrent operations and version conflicts
- 🚀 **Zero Setup**: No external dependencies or configuration required

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-store-inmemory
```

## Quick Start

```typescript
import { Effect } from 'effect';
import {
  makeInMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';

type MyEvent = { type: 'UserCreated'; data: { id: string; name: string } };

// Create the store and event store
const program = Effect.gen(function* () {
  const store = yield* makeInMemoryStore<MyEvent>();
  const eventStore = yield* makeInMemoryEventStore(store);

  // Append events
  yield* eventStore.append('user-123', [
    { type: 'UserCreated', data: { id: '123', name: 'John' } },
  ]);

  // Read events
  const events = yield* eventStore.read('user-123');
  console.log(events);
});

Effect.runPromise(program);
```

## API Reference

### `makeInMemoryStore<T>()`

Creates a new in-memory store instance.

**Returns:** `Effect<InMemoryStore<T>, never, never>`

### `makeInMemoryEventStore(store)`

Creates an EventStore implementation backed by the in-memory store.

**Parameters:**

- `store: InMemoryStore<T>` - The in-memory store instance

**Returns:** `Effect<EventStore<T>, never, never>`

### EventStore Operations

The returned EventStore implements the complete interface:

- `append(streamId, events, expectedVersion?)` - Append events to a stream
- `read(streamId, options?)` - Read events from a stream
- `subscribe(streamId?, handler)` - Subscribe to events

## Use Cases

### Unit Testing

Perfect for testing your event-sourced aggregates and domain logic:

```typescript
import { describe, it, expect } from 'bun:test';

describe('UserAggregate', () => {
  it('should create user correctly', async () => {
    const store = await Effect.runPromise(makeInMemoryStore());
    const eventStore = await Effect.runPromise(makeInMemoryEventStore(store));

    // Test your aggregate logic here
  });
});
```

### Development Environment

Great for local development when you don't want to set up a full database:

```typescript
const createDevEventStore = () =>
  Effect.gen(function* () {
    const store = yield* makeInMemoryStore();
    return yield* makeInMemoryEventStore(store);
  });
```

## Performance

This implementation is optimized for speed and simplicity:

- Events stored in plain JavaScript arrays
- O(1) stream lookups using Map data structures
- Minimal memory overhead
- No serialization/deserialization overhead

## Thread Safety

The in-memory store handles concurrent operations safely:

- Proper version checking for optimistic concurrency control
- Atomic append operations
- Safe subscription management

## Related Packages

- [`@codeforbreakfast/eventsourcing-store`](../eventsourcing-store) - Core interfaces and types
- [`@codeforbreakfast/eventsourcing-store-postgres`](../eventsourcing-store-postgres) - PostgreSQL implementation

## License

MIT
