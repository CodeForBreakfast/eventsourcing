# @codeforbreakfast/eventsourcing-store

Core types and event store implementations for event sourcing with Effect integration. This package provides the foundational interfaces and in-memory implementations needed to build event-sourced applications using functional programming patterns.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-store effect
```

```bash
bun add @codeforbreakfast/eventsourcing-store effect
```

## Key Features

- **Effect First**: Built from the ground up with Effect for composable, type-safe event sourcing
- **Functional Programming**: Immutable data structures and pure functional APIs
- **Type Safety**: Full TypeScript support with branded types for stream IDs and event numbers
- **Multiple Implementations**: In-memory stores for testing and development
- **Streaming Support**: Built-in support for event streaming with backpressure handling
- **Testing Utilities**: Comprehensive test suite utilities for validating custom event store implementations

## Quick Start

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  inMemoryEventStore,
  toStreamId,
  beginning,
  EventNumber,
} from '@codeforbreakfast/eventsourcing-store';

// Define your events
interface UserRegistered {
  type: 'UserRegistered';
  userId: string;
  email: string;
}

interface UserEmailUpdated {
  type: 'UserEmailUpdated';
  userId: string;
  newEmail: string;
}

type UserEvent = UserRegistered | UserEmailUpdated;

// Create an in-memory event store
const eventStoreLayer = inMemoryEventStore<UserEvent>();

// Example: Writing events to a stream
const appendEvents = (eventStore: EventStore<UserEvent>) => (userId: string, events: UserEvent[]) =>
  pipe(
    toStreamId(userId),
    Effect.flatMap((streamId) =>
      pipe(
        beginning(streamId),
        Effect.flatMap((position) =>
          pipe(Stream.fromIterable(events), Stream.run(eventStore.append(position)))
        )
      )
    )
  );

// Example: Reading historical events from a stream
const readUserEvents = (eventStore: EventStore<UserEvent>) => (userId: string) =>
  pipe(
    toStreamId(userId),
    Effect.flatMap((streamId) =>
      pipe(beginning(streamId), Effect.flatMap(eventStore.read), Effect.flatMap(Stream.runCollect))
    )
  );

// Usage with pipe composition
const program = pipe(
  Effect.all([
    Effect.succeed('user-123'),
    Effect.succeed([
      {
        type: 'UserRegistered' as const,
        userId: 'user-123',
        email: 'user@example.com',
      },
      {
        type: 'UserEmailUpdated' as const,
        userId: 'user-123',
        newEmail: 'newemail@example.com',
      },
    ] as UserEvent[]),
  ]),
  Effect.flatMap(([userId, events]) =>
    pipe(
      EventStore,
      Effect.flatMap((eventStore) =>
        pipe(
          appendEvents(eventStore)(userId, events),
          Effect.flatMap(() => readUserEvents(eventStore)(userId)),
          Effect.map((collectedEvents) => {
            console.log('Events:', collectedEvents);
            return collectedEvents;
          })
        )
      )
    )
  )
);

// Run the program
pipe(program, Effect.provide(eventStoreLayer), Effect.runPromise);
```

## Core Types

### EventStore Service

The main service interface for reading and writing events:

```typescript
interface EventStore<TEvent> {
  readonly write: (
    to: EventStreamPosition
  ) => Sink.Sink<
    EventStreamPosition,
    TEvent,
    TEvent,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >;

  readonly read: (
    from: EventStreamPosition
  ) => Effect.Effect<Stream.Stream<TEvent>, EventStoreError>;

  readonly subscribe: (
    from: EventStreamPosition
  ) => Effect.Effect<Stream.Stream<TEvent>, EventStoreError>;
}
```

- `append`: Append events to the end of a stream at a specific position (used for optimistic concurrency control)
- `read`: Read historical events only (no live updates)
- `subscribe`: Read historical events then continue with live updates

### Stream Types

```typescript
// Branded types for type safety
type EventStreamId = string & { readonly EventStreamId: unique symbol };
type EventNumber = number & { readonly EventNumber: unique symbol };

interface EventStreamPosition {
  readonly streamId: EventStreamId;
  readonly eventNumber: EventNumber;
}
```

## Available Implementations

### In-Memory Event Store

Perfect for testing and development:

```typescript
import { inMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

const eventStoreLayer = inMemoryEventStore<MyEvent>();
```

### Enhanced In-Memory Store

Includes additional features like stream tracking:

```typescript
import { enhancedInMemoryEventStore } from '@codeforbreakfast/eventsourcing-store';

const enhancedLayer = enhancedInMemoryEventStore<MyEvent>();
```

## Utility Functions

### Stream Position Helpers

```typescript
import { beginning, currentEnd, positionAfter } from '@codeforbreakfast/eventsourcing-store';

// Get the beginning of a stream
const startPos = pipe(toStreamId('my-stream'), Effect.flatMap(beginning));

// Get the current end of a stream
const endPos = pipe(
  currentEnd(eventStore),
  Effect.flatMap((fn) => fn(streamId))
);

// Create position after a specific event number
const nextPos = positionAfter(EventNumber(5))(streamId);
```

### Stream Processing

```typescript
import { OptimizedStreamHandler } from '@codeforbreakfast/eventsourcing-store';

// Create an optimized stream handler for processing events
const streamHandler = pipe(
  OptimizedStreamHandler,
  Effect.flatMap((handler) =>
    handler.processStream({
      streamId,
      batchSize: 100,
      processor: (events) =>
        pipe(
          Effect.logInfo(`Processing ${events.length} events`),
          Effect.map(() => events)
        ),
    })
  )
);
```

## Testing Your Event Store

This package includes comprehensive testing utilities:

```typescript
import { runEventStoreTestSuite } from '@codeforbreakfast/eventsourcing-store';

// Test your custom event store implementation
const testLayer = Layer.effect(EventStore, Effect.succeed(myCustomEventStore));

// Run the full test suite
describe('My Custom Event Store', () => {
  runEventStoreTestSuite(testLayer);
});
```

## Error Handling

The library provides specific error types for different failure scenarios:

```typescript
import { EventStoreError, ConcurrencyConflictError } from '@codeforbreakfast/eventsourcing-store';

const handleErrors = (effect: Effect.Effect<A, EventStoreError | ConcurrencyConflictError, R>) =>
  pipe(
    effect,
    Effect.catchTag('EventStoreError', (error) =>
      Effect.logError(`Event store error: ${error.message}`)
    ),
    Effect.catchTag('ConcurrencyConflictError', (error) =>
      Effect.logWarning(`Concurrency conflict: ${error.message}`)
    )
  );
```

## Related Packages

- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL implementation
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Aggregate root patterns
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
