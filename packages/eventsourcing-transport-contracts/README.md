# @codeforbreakfast/eventsourcing-transport-contracts

Pure transport layer abstractions and contracts for event sourcing. Define transport interfaces that any implementation (WebSocket, HTTP, SSE) can implement.

## Overview

This package provides the core abstractions for building transport layers in event sourcing systems. It contains **only contracts and testing utilities** - no implementations. This ensures clean separation between transport protocols and the business logic that uses them.

## Key Features

- **Protocol Agnostic**: Abstractions work with any transport (WebSocket, HTTP, SSE, etc.)
- **Type Safe**: Full TypeScript support with generic message types
- **Effect-Native**: Built on Effect for functional programming patterns
- **Contract Testing**: Complete test suite to verify transport implementations
- **Connection Management**: Standardized connection lifecycle management
- **Stream Support**: First-class support for message streaming
- **Error Handling**: Comprehensive error types for transport failures

## Core Interfaces

### `ConnectedTransport<TMessage>`

The main interface representing a fully connected transport that can send and receive messages:

```typescript
interface ConnectedTransport<TMessage extends TransportMessage = TransportMessage>
  extends ConnectionManager,
    MessagePublisher<TMessage>,
    MessageSubscriber<TMessage>,
    RequestResponse {}
```

### `TransportConnector<TMessage>`

The factory interface for creating connected transports. This design prevents calling transport methods before establishing a connection:

```typescript
interface TransportConnector<TMessage extends TransportMessage = TransportMessage> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TMessage>, ConnectionError, Scope.Scope>;
}
```

### `TransportMessage<TPayload>`

The base message type that all transport implementations must handle:

```typescript
interface TransportMessage<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}
```

## Error Types

The package provides standardized error types:

- `TransportError` - General transport operation failures
- `ConnectionError` - Connection establishment/management failures
- `MessageParseError` - Message serialization/deserialization failures

## Contract Testing

Use `runTransportContractTests` to verify your transport implementation meets all requirements:

```typescript
import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-transport-contracts';

runTransportContractTests('My Transport', () => setupMyTransport(), {
  supportsReconnection: true,
  supportsOfflineBuffering: false,
  guaranteesOrdering: true,
  supportsMultiplexing: true,
});
```

## Optional Features

Transports can optionally support advanced features:

```typescript
interface TransportFeatures {
  readonly supportsReconnection?: boolean;
  readonly supportsOfflineBuffering?: boolean;
  readonly supportsBackpressure?: boolean;
  readonly guaranteesOrdering?: boolean;
  readonly supportsMultiplexing?: boolean;
  readonly supportsBatching?: boolean;
  readonly supportsCompression?: boolean;
}
```

## Usage Example

```typescript
import { Effect, Stream } from 'effect';
import type {
  TransportConnector,
  TransportMessage,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// Define your message types
interface MyMessage extends TransportMessage<string> {
  type: 'chat' | 'notification';
}

// Use a transport connector
const useTransport = (connector: TransportConnector<MyMessage>) =>
  Effect.gen(function* () {
    // Connect to transport
    const transport = yield* connector.connect('ws://localhost:8080');

    // Subscribe to messages
    const messageStream = yield* transport.subscribe((msg) => msg.type === 'chat');

    // Send a message
    yield* transport.publish({
      id: crypto.randomUUID(),
      type: 'chat',
      payload: 'Hello, world!',
      timestamp: new Date(),
    });

    // Process incoming messages
    yield* Stream.runForEach(messageStream, (message) =>
      Effect.logInfo(`Received: ${message.payload}`)
    );
  });
```

## Design Principles

### 1. Protocol Independence

The abstractions work with any underlying protocol. Whether you're using WebSockets, Server-Sent Events, HTTP long polling, or custom TCP protocols, the same interfaces apply.

### 2. Connection Safety

The `TransportConnector` pattern ensures you cannot call transport methods before establishing a connection. This prevents a whole class of runtime errors.

### 3. Type Safety

Generic message types ensure compile-time safety for your specific message formats while allowing the transport layer to remain generic.

### 4. Effect Integration

Built on Effect for composable, type-safe error handling and resource management. Connections are automatically cleaned up when scopes exit.

### 5. Testing First

The contract test suite ensures any implementation correctly handles edge cases like reconnection, message ordering, and error conditions.

## Related Packages

- `@codeforbreakfast/eventsourcing-websocket-transport` - WebSocket implementation
- `@codeforbreakfast/eventsourcing-store` - Event store abstractions
- `@codeforbreakfast/eventsourcing-aggregates` - Aggregate root patterns

## License

MIT
