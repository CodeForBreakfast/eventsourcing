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
import { Effect, Stream, Chunk, pipe } from 'effect';
import {
  InMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import { toStreamId, beginning } from '@codeforbreakfast/eventsourcing-store';

type MyEvent = { type: 'UserCreated'; data: { id: string; name: string } };

const program = pipe(
  InMemoryStore.make<MyEvent>(),
  Effect.flatMap(makeInMemoryEventStore),
  Effect.flatMap((eventStore) =>
    pipe(
      toStreamId('user-123'),
      Effect.flatMap((streamId) =>
        pipe(
          beginning(streamId),
          Effect.flatMap((position) => {
            const events = Chunk.of<MyEvent>({
              type: 'UserCreated',
              data: { id: '123', name: 'John' },
            });
            return pipe(events, Stream.fromChunk, Stream.run(eventStore.append(position)));
          }),
          Effect.flatMap(() => beginning(streamId)),
          Effect.flatMap((position) => eventStore.read(position)),
          Effect.flatMap(Stream.runCollect),
          Effect.tap((events) => Effect.log(events))
        )
      )
    )
  )
);

Effect.runPromise(program);
```

## API Reference

### `InMemoryStore.make<T>()`

Creates a new in-memory store instance.

**Returns:** `Effect<InMemoryStore<T>, never, never>`

### `makeInMemoryEventStore(store)`

Creates an EventStore implementation backed by the in-memory store.

**Parameters:**

- `store: InMemoryStore<T>` - The in-memory store instance

**Returns:** `Effect<EventStore<T>, never, never>`

### EventStore Operations

The returned EventStore implements the complete interface:

- `append(position)` - Returns a Sink that appends events to a stream at the given position
- `read(position)` - Read historical events from a stream starting at position
- `subscribe(position)` - Subscribe to both historical and live events from position

## Use Cases

### Unit Testing

Perfect for testing your event-sourced aggregates and domain logic:

```typescript
import { describe, it, expect } from 'bun:test';
import { Effect, pipe } from 'effect';
import {
  InMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';

describe('UserAggregate', () => {
  it('should create user correctly', async () => {
    const eventStore = await pipe(
      InMemoryStore.make(),
      Effect.flatMap(makeInMemoryEventStore),
      Effect.runPromise
    );

    // Test your aggregate logic here
  });
});
```

### Development Environment

Great for local development when you don't want to set up a full database:

```typescript
import { Effect, pipe } from 'effect';
import {
  InMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';

const createDevEventStore = () =>
  pipe(InMemoryStore.make(), Effect.flatMap(makeInMemoryEventStore));
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
