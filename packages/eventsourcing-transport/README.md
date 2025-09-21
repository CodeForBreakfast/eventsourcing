# @codeforbreakfast/eventsourcing-transport

Universal transport abstractions for event sourcing with Effect - Define transport-agnostic interfaces for real-time communication.

## Overview

This package provides a universal transport abstraction that can be implemented by any transport mechanism (WebSocket, HTTP, Server-Sent Events, gRPC streams, etc.) while maintaining type safety and Effect composition patterns.

## Core Concepts

### Transport Interface

```typescript
interface Transport<TData = unknown, TStreamId = string, R = never> {
  readonly connect: () => Effect.Effect<void, TransportConnectionError, R>;
  readonly publish: (
    streamId: TStreamId,
    data: TData,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError, R>;
  readonly subscribe: (
    streamId: TStreamId,
    options?: SubscriptionOptions
  ) => Stream.Stream<StreamMessage<TData, TStreamId>, TransportSubscriptionError, R>;
  readonly subscribeMultiple: (
    streamIds: readonly TStreamId[],
    options?: SubscriptionOptions
  ) => Stream.Stream<StreamMessage<TData, TStreamId>, TransportSubscriptionError, R>;
  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
  readonly close: () => Effect.Effect<void, TransportConnectionError, R>;
}
```

### Stream Messages

Messages flowing through the transport include metadata and positioning information:

```typescript
interface StreamMessage<TData = unknown, TStreamId = string> {
  readonly streamId: TStreamId;
  readonly data: TData;
  readonly position?: number;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}
```

### Resource Management

Use the `makeTransport` helper for proper resource lifecycle management:

```typescript
const managedTransport = makeTransport(createWebSocketTransport, config);
```

This ensures the transport is properly closed when the Effect scope is released.

## Implementation Example

```typescript
import { Transport, makeTransport, TransportConfig } from '@codeforbreakfast/eventsourcing-transport';

// Implement your specific transport
const createMyTransport = (config: TransportConfig): Effect.Effect<Transport<MyData, MyStreamId>, TransportConnectionError> =>
  Effect.gen(function* (_) {
    // Your transport implementation
    return {
      connect: () => /* connect logic */,
      publish: (streamId, data) => /* publish logic */,
      subscribe: (streamId, options) => /* subscribe logic */,
      // ... other methods
    };
  });

// Use with resource management
const program = Effect.gen(function* (_) {
  const transport = yield* _(makeTransport(createMyTransport, config));

  // Use the transport
  yield* _(transport.publish("stream-1", { data: "hello" }));

  const events = transport.subscribe("stream-1");
  yield* _(Stream.runDrain(events));
});
```

## Error Handling

The package provides a comprehensive error hierarchy:

- `TransportError` - Base transport error
- `TransportConnectionError` - Connection-related errors with retry capability
- `TransportSubscriptionError` - Subscription-related errors
- `TransportPublishError` - Publishing-related errors

## Type Parameters

- `TData` - The type of data being transported
- `TStreamId` - The type of stream identifiers (e.g., `EventStreamId` for event sourcing)
- `R` - Effect requirements (dependencies needed by the transport)

## Universal Design

This abstraction separates transport-specific concerns (connection management, protocol details) from universal patterns (publish/subscribe, health monitoring, resource cleanup) allowing the same high-level logic to work with any transport implementation.
