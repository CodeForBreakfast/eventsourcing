# @codeforbreakfast/eventsourcing-transport-websocket

WebSocket transport implementation for event sourcing - Real-time bidirectional message transport over WebSocket connections.

## Overview

This package provides WebSocket client and server transport implementations that follow the transport contracts defined in `@codeforbreakfast/eventsourcing-transport`. It enables real-time, bidirectional communication between clients and servers using WebSockets.

## Key Features

- ✅ **Real-time Communication**: WebSocket-based bidirectional messaging
- ✅ **Client & Server Support**: Both WebSocket client connector and server acceptor
- ✅ **Effect-Native**: Built with Effect for composability and type safety
- ✅ **Contract Compliant**: Implements transport contract interfaces
- ✅ **Connection Management**: Handles connection lifecycle with proper cleanup
- ✅ **Message Filtering**: Subscribe to specific message types
- ✅ **Broadcasting**: Server can broadcast messages to all connected clients
- ✅ **Scope-based Resources**: Automatic cleanup with Effect Scope

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-transport-websocket
```

## Client Usage

### Basic Connection

```typescript
import { Effect, Stream, pipe } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { makeMessageId } from '@codeforbreakfast/eventsourcing-transport';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Connect to WebSocket server
    const transport = yield* WebSocketConnector.connect('ws://localhost:8080');

    // Monitor connection state
    yield* pipe(
      transport.connectionState,
      Stream.runForEach((state) => Effect.sync(() => console.log('Connection state:', state))),
      Effect.fork
    );

    // Subscribe to messages
    const subscription = yield* transport.subscribe();

    // Handle incoming messages
    yield* pipe(
      subscription,
      Stream.runForEach((message) => Effect.sync(() => console.log('Received:', message))),
      Effect.fork
    );

    // Publish a message
    yield* transport.publish({
      id: makeMessageId('msg-1'),
      type: 'chat.message',
      payload: { text: 'Hello WebSocket!' },
    });
  })
);

// Run with automatic cleanup
await Effect.runPromise(program);
```

### Message Filtering

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const transport = yield* WebSocketConnector.connect('ws://localhost:8080');

    // Subscribe only to specific message types
    const chatMessages = yield* transport.subscribe((msg) => msg.type.startsWith('chat.'));

    // Handle filtered messages
    yield* pipe(
      chatMessages,
      Stream.runForEach((message) => Effect.sync(() => console.log('Chat message:', message)))
    );
  })
);
```

## Server Usage

### Basic Server

```typescript
import { Effect, Stream, pipe } from 'effect';
import { WebSocketAcceptor } from '@codeforbreakfast/eventsourcing-transport-websocket';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Create WebSocket server
    const acceptor = yield* WebSocketAcceptor.make({
      port: 8080,
      host: 'localhost',
    });

    // Start accepting connections
    const transport = yield* acceptor.start();

    // Handle new client connections
    yield* pipe(
      transport.connections,
      Stream.runForEach((connection) =>
        Effect.gen(function* () {
          console.log('Client connected:', connection.clientId);

          // Subscribe to messages from this client
          const messages = yield* connection.transport.subscribe();

          // Echo messages back to client
          yield* pipe(
            messages,
            Stream.runForEach((message) =>
              connection.transport.publish({
                ...message,
                id: makeMessageId(`echo-${message.id}`),
                type: 'echo.response',
              })
            ),
            Effect.fork
          );
        })
      )
    );
  })
);

// Run server
await Effect.runPromise(program);
```

### Broadcasting to All Clients

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const acceptor = yield* WebSocketAcceptor.make({
      port: 8080,
      host: 'localhost',
    });

    const transport = yield* acceptor.start();

    // Broadcast to all connected clients
    yield* transport.broadcast({
      id: makeMessageId('broadcast-1'),
      type: 'server.announcement',
      payload: { message: 'Server is shutting down in 5 minutes' },
    });
  })
);
```

## Connection States

The transport tracks connection states:

- `connecting`: Initial connection attempt
- `connected`: Successfully connected
- `disconnected`: Connection closed
- `error`: Connection error occurred

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const transport = yield* WebSocketConnector.connect('ws://localhost:8080');

    // Monitor connection state changes
    yield* pipe(
      transport.connectionState,
      Stream.runForEach((state) =>
        Effect.sync(() => {
          switch (state) {
            case 'connected':
              console.log('Connected to server');
              break;
            case 'disconnected':
              console.log('Disconnected from server');
              break;
            case 'error':
              console.error('Connection error');
              break;
          }
        })
      )
    );
  })
);
```

## Error Handling

The transport uses typed errors from the contracts package:

```typescript
import { ConnectionError, TransportError } from '@codeforbreakfast/eventsourcing-transport';

const program = Effect.scoped(
  pipe(
    WebSocketConnector.connect('ws://invalid-server:9999'),
    Effect.catchTag('ConnectionError', (error) =>
      Effect.sync(() => console.error('Failed to connect:', error.message))
    )
  )
);
```

## Testing

The package includes comprehensive tests:

### Unit Tests

Tests edge cases using mock WebSockets:

- Connection errors
- Malformed messages
- Rapid state changes

### Integration Tests

Tests real WebSocket communication:

- Client-server message exchange
- Broadcasting
- Multiple client connections
- Connection lifecycle
- Resource cleanup

```bash
# Run all tests
bun test packages/eventsourcing-transport-websocket

# Run unit tests only
bun test packages/eventsourcing-transport-websocket/src/lib/websocket-transport.test.ts

# Run integration tests only
bun test packages/eventsourcing-transport-websocket/src/tests/integration/
```

## Architecture

This package implements the transport layer abstraction:

```
┌─────────────────────────────────────┐
│     Application Layer               │  ← Your application
├─────────────────────────────────────┤
│     Protocol Layer                  │  ← Domain protocols (optional)
├─────────────────────────────────────┤
│     Transport Layer                 │  ← This package (WebSocket)
└─────────────────────────────────────┘
```

The transport is protocol-agnostic and moves `TransportMessage` objects between clients and servers without understanding their content.

## API Reference

### Client API

#### WebSocketConnector

```typescript
const WebSocketConnector: Context.Tag.Service<typeof Client.Connector> = {
  connect(url: string): Effect.Effect<
    Client.Transport,
    ConnectionError,
    Scope.Scope
  >
}
```

#### Client.Transport

```typescript
interface Transport<TMessage> {
  connectionState: Stream.Stream<ConnectionState, never, never>;

  publish(message: TMessage): Effect.Effect<void, TransportError, never>;

  subscribe(
    filter?: (message: TMessage) => boolean
  ): Effect.Effect<Stream.Stream<TMessage, never, never>, TransportError, never>;
}
```

### Server API

#### WebSocketAcceptor

```typescript
const WebSocketAcceptor: {
  make(config: {
    port: number;
    host: string;
  }): Effect.Effect<Context.Tag.Service<typeof Server.Acceptor>, never, never>;
};
```

#### Server.Transport

```typescript
interface Transport<TMessage> {
  connections: Stream.Stream<ClientConnection, never, never>;

  broadcast(message: TMessage): Effect.Effect<void, TransportError, never>;
}
```

## Implementation Notes

- Uses Bun's native WebSocket implementation for performance
- Handles connection lifecycle with Effect's Scope for automatic cleanup
- Message parsing errors are silently dropped to prevent stream corruption
- Each client subscription gets its own queue for message isolation
- Server maintains a map of connected clients with their state

## Contributing

This package is part of the `@codeforbreakfast/eventsourcing` monorepo. See the main repository for contribution guidelines.

## License

MIT
