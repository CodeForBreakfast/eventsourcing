# @codeforbreakfast/eventsourcing-store

Pure event streaming and storage for event sourcing with Effect integration. This package provides the foundational event storage interfaces and implementations needed to build event-sourced applications using functional programming patterns.

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
- **Clean Abstractions**: Core interfaces and types without implementation dependencies
- **Streaming Support**: Built-in support for event streaming with backpressure handling
- **Testing Utilities**: Comprehensive test suite utilities for validating custom event store implementations

## Quick Start

```typescript
import { Effect, Stream, pipe } from 'effect';
import { type EventStore, toStreamId, beginning } from '@codeforbreakfast/eventsourcing-store';

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

// Declare an event store (provided by implementation packages)
declare const eventStore: EventStore<UserEvent>;

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
      appendEvents(eventStore)(userId, events),
      Effect.flatMap(() => readUserEvents(eventStore)(userId)),
      Effect.map((collectedEvents) => {
        console.log('Events:', collectedEvents);
        return collectedEvents;
      })
    )
  )
);
```

For complete working examples with concrete implementations, see the [In-Memory](#in-memory-event-store) and [PostgreSQL](#postgresql-event-store) sections below.

## Core Types

### EventStore Service

The main service interface for reading and writing events:

```typescript
import { Effect, ParseResult, Sink, Stream } from 'effect';
import {
  EventStoreError,
  ConcurrencyConflictError,
  type EventStreamPosition,
  type StreamEvent,
} from '@codeforbreakfast/eventsourcing-store';

interface EventStore<TEvent> {
  readonly append: (
    to: EventStreamPosition
  ) => Sink.Sink<
    EventStreamPosition,
    TEvent,
    TEvent,
    ConcurrencyConflictError | ParseResult.ParseError | EventStoreError
  >;

  readonly read: (
    from: EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;

  readonly subscribe: (
    from: EventStreamPosition
  ) => Effect.Effect<
    Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;

  readonly subscribeAll: () => Effect.Effect<
    Stream.Stream<StreamEvent<TEvent>, ParseResult.ParseError | EventStoreError>,
    EventStoreError,
    never
  >;
}
```

- `append`: Append events to the end of a stream at a specific position (used for optimistic concurrency control)
- `read`: Read historical events only (no live updates)
- `subscribe`: Read historical events then continue with live updates
- `subscribeAll`: Subscribe to live events from all streams (no historical replay, includes stream position metadata)

### Stream Types

```typescript
// Branded types for type safety
type EventStreamId = string & { readonly EventStreamId: unique symbol };
type EventNumber = number & { readonly EventNumber: unique symbol };

interface EventStreamPosition {
  readonly streamId: EventStreamId;
  readonly eventNumber: EventNumber;
}

// Event with position metadata (used by subscribeAll)
type StreamEvent<T> = {
  readonly position: EventStreamPosition;
  readonly event: T;
};
```

### Creating Event Store Service Tags

**⚠️ IMPORTANT: Always create domain-specific event store tags**

Each aggregate or bounded context should create its own typed event store tag using `Context.GenericTag`:

```typescript
import { Schema, Context } from 'effect';
import { type EventStore } from '@codeforbreakfast/eventsourcing-store';

// 1. Define your domain events
const UserCreated = Schema.Struct({
  type: Schema.Literal('UserCreated'),
  data: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
});

const UserUpdated = Schema.Struct({
  type: Schema.Literal('UserUpdated'),
  data: Schema.Struct({
    email: Schema.String,
  }),
});

// 2. Create event union
const UserEvent = Schema.Union(UserCreated, UserUpdated);
type UserEvent = typeof UserEvent.Type;

// 3. Create domain-specific event store tag
export const UserEventStore = Context.GenericTag<EventStore<UserEvent>, EventStore<UserEvent>>(
  'UserEventStore'
);
```

**Do NOT use:**

- Generic `Event` type in domain code
- Factory functions with default type parameters
- `EventStore<unknown>()` or `EventStore<Event>()`

The generic `Event` type exists only for serialization boundaries (storage implementations, wire protocol). Your domain code should always use specific event union types.

## Available Implementations

This package provides core interfaces and types. For concrete implementations, use:

### In-Memory Event Store

Perfect for testing and development. See the [@codeforbreakfast/eventsourcing-store-inmemory](../eventsourcing-store-inmemory) package for complete documentation and examples.

```bash
bun add @codeforbreakfast/eventsourcing-store-inmemory
```

### PostgreSQL Event Store

For production use with PostgreSQL. See the [@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres) package for complete documentation and examples.

```bash
bun add @codeforbreakfast/eventsourcing-store-postgres
```

### Filesystem Event Store

For local development and debugging. See the [@codeforbreakfast/eventsourcing-store-filesystem](../eventsourcing-store-filesystem) package for complete documentation and examples.

```bash
bun add @codeforbreakfast/eventsourcing-store-filesystem
```

## Utility Functions

### Stream Position Helpers

```typescript
import { Effect, ParseResult, Schema, pipe } from 'effect';
import {
  beginning,
  toStreamId,
  type EventStreamId,
  type EventStreamPosition,
} from '@codeforbreakfast/eventsourcing-store';

declare const streamId: EventStreamId;

// Get the beginning of a stream
const startPos = pipe(toStreamId('my-stream'), Effect.flatMap(beginning));

// Create a position at a specific event number
const positionAt = (
  streamId: EventStreamId,
  eventNumber: number
): Effect.Effect<EventStreamPosition, ParseResult.ParseError> =>
  Schema.decode(
    Schema.Struct({
      streamId: Schema.Literal(streamId),
      eventNumber: Schema.Number,
    })
  )({ streamId, eventNumber });

const nextPos = positionAt(streamId, 5);
```

### Stream Processing

```typescript
import { Chunk, Effect, Stream, pipe } from 'effect';
import {
  beginning,
  type EventStore,
  type EventStreamId,
} from '@codeforbreakfast/eventsourcing-store';

interface MyEvent {
  type: string;
}

declare const streamId: EventStreamId;
declare const eventStore: EventStore<MyEvent>;

// Process events from a stream in batches
const processStreamInBatches = (batchSize: number) =>
  pipe(
    beginning(streamId),
    Effect.flatMap(eventStore.read),
    Effect.flatMap((stream) =>
      pipe(
        stream,
        Stream.grouped(batchSize),
        Stream.mapEffect((events: Chunk.Chunk<MyEvent>) =>
          pipe(
            Effect.logInfo(`Processing ${events.length} events`),
            Effect.map(() => events)
          )
        ),
        Stream.runDrain
      )
    )
  );
```

### Subscribe to All Events

The `subscribeAll()` method allows you to subscribe to live events from all streams in the event store. Each event includes position metadata (stream ID and event number):

```typescript
import { Effect, Stream, pipe } from 'effect';
import { type EventStore, type StreamEvent } from '@codeforbreakfast/eventsourcing-store';

interface MyEvent {
  type: string;
  data: unknown;
}

declare const eventStore: EventStore<MyEvent>;

// Subscribe to all events across all streams
const subscribeToAllEvents = pipe(
  eventStore.subscribeAll(),
  Effect.flatMap((stream) =>
    pipe(
      stream,
      Stream.runForEach((storedEvent: StreamEvent<MyEvent>) => {
        console.log(
          `Event from stream ${storedEvent.position.streamId} at position ${storedEvent.position.eventNumber}:`,
          storedEvent.event
        );
        return Effect.void;
      })
    )
  )
);
```

## Testing Your Event Store

This package includes comprehensive testing utilities:

```typescript
import { Effect, Layer, Schema } from 'effect';
import {
  runEventStoreTestSuite,
  FooEventStore,
  type EventStore,
} from '@codeforbreakfast/eventsourcing-store';

const FooEvent = Schema.Struct({ bar: Schema.String });
type FooEvent = typeof FooEvent.Type;

declare const myCustomEventStore: EventStore<FooEvent>;

// Test your custom event store implementation
const testLayer = Layer.effect(FooEventStore, Effect.succeed(myCustomEventStore));

// Run the full test suite with the implementation name
runEventStoreTestSuite('My Custom Event Store', () => testLayer);
```

## Error Handling

The library provides specific error types for different failure scenarios:

```typescript
import { Effect, pipe } from 'effect';
import { EventStoreError, ConcurrencyConflictError } from '@codeforbreakfast/eventsourcing-store';

const handleErrors = <A, R>(
  effect: Effect.Effect<A, EventStoreError | ConcurrencyConflictError, R>
) =>
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

- **[@codeforbreakfast/eventsourcing-store-inmemory](../eventsourcing-store-inmemory)** - In-memory implementation for testing and development
- **[@codeforbreakfast/eventsourcing-store-postgres](../eventsourcing-store-postgres)** - PostgreSQL implementation for production
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Aggregate root patterns
- **[@codeforbreakfast/eventsourcing-projections](../eventsourcing-projections)** - Read-side projection patterns
- **[@codeforbreakfast/eventsourcing-websocket-transport](../eventsourcing-websocket-transport)** - Real-time event streaming

## API Reference

For detailed API documentation, see the [TypeScript definitions](./src/index.ts) included with this package.

## Contributing

This package is part of the [@codeforbreakfast/eventsourcing](https://github.com/codeforbreakfast/eventsourcing) monorepo. Please see the main repository for contributing guidelines.

## License

MIT
