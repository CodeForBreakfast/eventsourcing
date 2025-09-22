# @codeforbreakfast/eventsourcing-transport-websocket

WebSocket transport implementation for event sourcing - Protocol-agnostic message transport over WebSocket connections.

## Overview

This package provides a minimal, protocol-agnostic WebSocket transport implementation that follows the transport contracts defined in `@codeforbreakfast/eventsourcing-transport-contracts`. It focuses purely on message transport without any event sourcing domain concepts.

## Key Features

- ✅ **Protocol Agnostic**: Just moves messages - no domain concepts
- ✅ **Contract Compliant**: Implements all required transport interfaces
- ✅ **Effect-Native**: Built with Effect for composability and type safety
- ✅ **Real-time**: WebSocket-based bidirectional communication
- ✅ **Reconnection**: Automatic reconnection with offline buffering
- ✅ **Multiplexing**: Multiple message types over single connection
- ✅ **Message Ordering**: Guarantees message order within connection
- ✅ **Request/Response**: Built-in request/response pattern with timeouts

## Transport Features

```typescript
export const WEBSOCKET_FEATURES: TransportFeatures = {
  supportsReconnection: true,
  supportsOfflineBuffering: true,
  supportsBackpressure: false,
  guaranteesOrdering: true,
  supportsMultiplexing: true,
  supportsBatching: false,
  supportsCompression: false,
} as const;
```

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-transport-websocket
```

## Basic Usage

```typescript
import { Effect, Scope } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import type { TransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';

// Create a connector
const connector = new WebSocketConnector();

// Connect to WebSocket server
const program = Effect.scoped(
  Effect.gen(function* () {
    // Connect to server
    const transport = yield* connector.connect('ws://localhost:8080');

    // Subscribe to messages
    const messageStream = yield* transport.subscribe((msg) => msg.type === 'chat-message');

    // Handle incoming messages
    yield* Stream.runForEach(messageStream, (message) =>
      Effect.sync(() => console.log('Received:', message.payload))
    );

    // Publish a message
    const chatMessage: TransportMessage = {
      id: crypto.randomUUID(),
      type: 'chat-message',
      payload: { text: 'Hello WebSocket!' },
      timestamp: new Date(),
    };

    yield* transport.publish(chatMessage);
  })
);

// Run the program
Effect.runPromise(program);
```

## Request/Response Pattern

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const transport = yield* connector.connect('ws://localhost:8080');

    try {
      const response = yield* transport.request(
        { action: 'get-user', userId: '123' },
        30000 // 30 second timeout
      );
      console.log('Response:', response);
    } catch (error) {
      console.error('Request failed:', error);
    }
  })
);
```

## Advanced Features

### Reconnection and Buffering

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const transport = yield* connector.connect('ws://localhost:8080');

    // Messages sent during disconnection are buffered
    yield* transport.publish(message1);
    yield* transport.simulateDisconnect(); // Network issue
    yield* transport.publish(message2); // Buffered
    yield* transport.publish(message3); // Buffered

    yield* transport.simulateReconnect(); // Reconnects and flushes buffer

    // Check buffer status
    const bufferedCount = yield* transport.getBufferedMessageCount();
    console.log('Buffered messages:', bufferedCount);
  })
);
```

### Message Filtering

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const transport = yield* connector.connect('ws://localhost:8080');

    // Subscribe to specific message types
    const chatMessages = yield* transport.subscribe((msg) => msg.type === 'chat');

    const notifications = yield* transport.subscribe(
      (msg) => msg.type === 'notification' && msg.metadata?.priority === 'high'
    );

    // Handle different streams separately
    yield* Effect.fork(Stream.runForEach(chatMessages, handleChatMessage));

    yield* Effect.fork(Stream.runForEach(notifications, handleNotification));
  })
);
```

## Testing

This package includes comprehensive contract tests that validate the transport implementation:

```typescript
import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
import {
  WebSocketConnector,
  WEBSOCKET_FEATURES,
} from '@codeforbreakfast/eventsourcing-transport-websocket';

// Run contract tests
runTransportContractTests('WebSocket', createWebSocketTestContext, WEBSOCKET_FEATURES);
```

The tests validate:

- Connection management
- Message delivery and ordering
- Request/response patterns
- Reconnection behavior
- Buffer management
- Error handling
- Stream lifecycle

## Architecture

This package follows the transport abstraction pattern:

```
┌─────────────────────────────────────┐
│           Protocol Layer            │  ← Domain-specific (commands, events)
├─────────────────────────────────────┤
│          Transport Layer            │  ← This package (WebSocket)
└─────────────────────────────────────┘
```

The transport layer is completely protocol-agnostic and just moves `TransportMessage` objects. The protocol layer (not included) would handle domain-specific concepts like commands, events, and aggregates.

## API Reference

### WebSocketConnector

Main entry point for creating WebSocket connections.

```typescript
class WebSocketConnector implements TransportConnector {
  connect(url: string): Effect.Effect<ConnectedTransport, ConnectionError, Scope.Scope>;
}
```

### WebSocketTransport

The connected transport instance with all transport operations.

```typescript
class WebSocketTransport implements AdvancedTransport {
  // Connection management
  connect(): Effect.Effect<void, ConnectionError, never>;
  disconnect(): Effect.Effect<void, never, never>;
  isConnected(): Effect.Effect<boolean, never, never>;
  getState(): Effect.Effect<ConnectionState, never, never>;

  // Pub/Sub
  publish(message: TransportMessage): Effect.Effect<void, TransportError, never>;
  subscribe(
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never>;

  // Request/Response
  request<TRequest, TResponse>(
    request: TRequest,
    timeoutMs?: number
  ): Effect.Effect<TResponse, TransportError, never>;

  // Advanced features
  simulateDisconnect(): Effect.Effect<void, never, never>;
  simulateReconnect(): Effect.Effect<void, never, never>;
  getBufferedMessageCount(): Effect.Effect<number, never, never>;
  flushBuffer(): Effect.Effect<void, TransportError, never>;
}
```

## Error Handling

The transport uses structured errors from the contracts package:

- `ConnectionError`: WebSocket connection failures
- `TransportError`: Message serialization/transport errors
- `MessageParseError`: Incoming message parsing errors

## Contributing

This package is part of the `@codeforbreakfast/eventsourcing` monorepo. See the main repository for contribution guidelines.

## License

MIT
