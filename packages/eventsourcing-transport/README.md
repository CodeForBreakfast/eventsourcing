# @codeforbreakfast/eventsourcing-transport

Universal transport abstractions for event sourcing with Effect - Connection-gated, type-safe interfaces for real-time communication.

## Overview

This package provides connection-gated transport abstractions that make it impossible to use transport methods without being connected. It supports multiple abstraction levels (raw, schema-aware) and can be implemented by any transport mechanism (WebSocket, HTTP, Server-Sent Events, gRPC streams, etc.) while maintaining full type safety and Effect composition patterns.

## Core Concepts

### Connection-Gated Pattern

The transport interface uses a connection-gated pattern where methods are only available on a connected transport:

```typescript
// Transport factory creates connected transports
interface Transport<TData = unknown, TStreamId = string, R = never> {
  readonly makeConnected: (
    config: TransportConfig
  ) => Effect.Effect<
    ConnectedTransport<TData, TStreamId, R>,
    TransportConnectionError,
    R | Scope.Scope
  >;
}

// Connected transport provides the actual operations
interface ConnectedTransport<TData = unknown, TStreamId = string, R = never> {
  readonly publish: (
    streamId: TStreamId,
    data: TData,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError, R>;
  readonly subscribe: (
    streamId: TStreamId,
    options?: SubscriptionOptions
  ) => Stream.Stream<StreamMessage<TData, TStreamId>, TransportSubscriptionError, R>;
  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
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

The connection-gated pattern ensures proper resource lifecycle management using `Effect.acquireRelease`:

```typescript
// Using the helper function
const program = withTransport(myTransport, config, (connected) =>
  pipe(
    connected.publish('stream-1', { data: 'hello' }),
    Effect.flatMap(() => connected.subscribe('stream-1')),
    Stream.runDrain
  )
);
```

This pattern guarantees:

- Connection is established before any operations
- Transport is properly closed when the scope ends
- Impossible to use transport methods without being connected

## Usage Examples

### Basic Transport Usage

```typescript
import { withTransport } from '@codeforbreakfast/eventsourcing-transport';

const program = Effect.gen(function* (_) {
  return yield* _(
    withTransport(myTransport, config, (transport) =>
      Effect.gen(function* (_) {
        // Transport is guaranteed to be connected here
        yield* _(transport.publish('stream-1', { hello: 'world' }));

        const health = yield* _(transport.health);
        console.log(`Connected: ${health.connected}`);

        return 'Success!';
      })
    )
  );
  // Transport automatically closed here
});
```

### Schema-Aware Transport

```typescript
import { withSchemaTransport, Codecs } from '@codeforbreakfast/eventsourcing-transport';
import { Schema } from '@effect/schema';

const EventSchema = Schema.Struct({
  type: Schema.String,
  aggregateId: Schema.String,
  data: Schema.Unknown,
});

const program = withSchemaTransport(myRawTransport, Codecs.json(EventSchema), config, (transport) =>
  transport.publish('events', {
    type: 'UserCreated', // Type-safe!
    aggregateId: 'user-123',
    data: { name: 'John' },
  })
);
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

## Architecture Layers

The package provides multiple abstraction layers:

### 1. Basic Transport

High-level interface for simple publish/subscribe patterns with connection gating.

### 2. Raw Transport

Low-level interface for wire communication (strings, binary, etc.) with connection gating.

### 3. Schema Transport

Type-safe layer that composes raw transports with schema-based codecs for automatic encoding/decoding.

## Key Features

- **Connection-Gated**: Impossible to use transport methods without being connected
- **Type-Safe**: Full TypeScript support with generic type parameters
- **Schema-Aware**: Optional schema validation with Effect Schema
- **Composable**: Works with Effect's composition patterns
- **Resource-Safe**: Automatic cleanup with Effect.acquireRelease
- **Multi-Layer**: Different abstraction levels for different use cases

## Implementation Examples

See the `examples/` directory for complete implementations:

- `in-memory-transport.ts` - Reference in-memory implementation
- `websocket-raw-transport.ts` - WebSocket with schema layer
- `README.md` - Migration guide and best practices
