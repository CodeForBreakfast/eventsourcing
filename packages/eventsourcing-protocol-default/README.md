# @codeforbreakfast/eventsourcing-protocol-default

Default implementation of the event sourcing protocol over any transport. This is the standard protocol implementation that provides message serialization, command correlation, and subscription management.

## Features

- 🚀 **Transport-agnostic**: Works with any transport implementation (WebSocket, HTTP, SSE, etc.)
- 📡 **Message Protocol**: Standard serialization/deserialization of event sourcing messages
- 🔗 **Command Correlation**: Automatic tracking and correlation of commands to responses
- 📊 **Subscription Management**: Handle event stream subscriptions with position tracking
- 🎯 **Type-safe**: Full TypeScript support with Effect integration
- 🧪 **Fully Tested**: Comprehensive test suite using protocol contract tests

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-protocol-default
```

## Usage

### Basic Protocol Setup

```typescript
import { Effect, Layer } from 'effect';
import { DefaultProtocolAdapter } from '@codeforbreakfast/eventsourcing-protocol-default';
import { createProtocolContext } from '@codeforbreakfast/eventsourcing-protocol-contracts';

// Create protocol context
const context = createProtocolContext({
  sessionId: 'my-session',
  correlationId: 'my-correlation-id',
});

// Create adapter with any transport
const adapter = DefaultProtocolAdapter.create();

// Connect to transport and get protocol
const program = Effect.gen(function* () {
  const transport = yield* myTransportConnector.connect('ws://localhost:8080');
  const protocol = yield* adapter.adapt(transport, serializer, context);

  // Use protocol for event sourcing operations
  const events = yield* protocol.subscribe({ position: 0 });
  yield* protocol.sendCommand({
    id: 'cmd-1',
    aggregateId: 'user-123',
    aggregateName: 'User',
    commandName: 'CreateUser',
    payload: { name: 'John' },
  });
});
```

### Protocol Connector

```typescript
import { DefaultProtocolConnector } from '@codeforbreakfast/eventsourcing-protocol-default';

// Create connector with transport
const connector = DefaultProtocolConnector.create(myTransportConnector);

// Connect and get ready-to-use protocol
const program = Effect.gen(function* () {
  const protocol = yield* connector.connect('ws://localhost:8080');

  // Protocol is ready to use
  const events = yield* protocol.subscribe({ position: 0 });
});
```

### Layer Setup

```typescript
// Create layer for dependency injection
const ProtocolLayer = DefaultProtocolConnector.Live.pipe(Layer.provide(MyTransportConnectorLayer));

// Use in your application
const program = Effect.gen(function* () {
  const connector = yield* EventSourcingProtocolConnector;
  const protocol = yield* connector.connect('ws://localhost:8080');

  // Use protocol...
}).pipe(Effect.provide(ProtocolLayer));
```

## API Reference

### DefaultProtocolSerializer

Handles serialization between domain objects and protocol messages.

```typescript
interface ProtocolSerializer<TEvent> {
  serializeCommand(command, context?): Effect<ClientMessage, ProtocolSerializationError>;
  deserializeEvent(message): Effect<StreamEvent<TEvent>, ProtocolSerializationError>;
  serializeSubscription(
    position,
    options?,
    context?
  ): Effect<ClientMessage, ProtocolSerializationError>;
  deserializeCommandResult(message): Effect<CommandResult, ProtocolSerializationError>;
}
```

### DefaultProtocolAdapter

Bridges transport layer to event sourcing protocol.

```typescript
interface EventSourcingTransportAdapter<TEvent> {
  adapt(transport, serializer, context): Effect<EventSourcingProtocol<TEvent>>;
}
```

### DefaultProtocolConnector

Complete connector that handles connection and protocol setup.

```typescript
interface EventSourcingProtocolConnector<TEvent> {
  connect(
    url,
    context?
  ): Effect<EventSourcingProtocol<TEvent>, ConnectionError | StreamError, Scope>;
  createSerializer(): ProtocolSerializer<TEvent>;
}
```

## Protocol Messages

The default implementation uses a standard JSON-based message format:

### Client Messages (to server)

```typescript
// Command message
{
  type: "command",
  messageId: "msg-123",
  correlationId: "corr-456",
  sessionId: "session-789",
  payload: {
    commandId: "cmd-1",
    aggregateId: "user-123",
    aggregateName: "User",
    commandName: "CreateUser",
    payload: { name: "John" }
  }
}

// Subscription message
{
  type: "subscribe",
  messageId: "msg-124",
  correlationId: "corr-457",
  sessionId: "session-789",
  payload: {
    streamId: "*",
    position: { type: "start" },
    options: { bufferSize: 100 }
  }
}
```

### Server Messages (from server)

```typescript
// Event message
{
  type: "event",
  messageId: "msg-125",
  correlationId: "corr-457",
  payload: {
    streamId: "user-123",
    position: { sequence: 1, timestamp: "2024-01-01T00:00:00Z" },
    eventName: "UserCreated",
    payload: { id: "user-123", name: "John" }
  }
}

// Command result
{
  type: "command_result",
  messageId: "msg-126",
  correlationId: "corr-456",
  payload: {
    commandId: "cmd-1",
    success: true,
    result: { aggregateId: "user-123", version: 1 }
  }
}
```

## Testing

This package includes comprehensive tests using the protocol contract test suite:

```typescript
import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
import { DefaultProtocolAdapter } from '@codeforbreakfast/eventsourcing-protocol-default';

// Test with your transport
await runDomainContractTests({
  createProtocol: () => DefaultProtocolAdapter.create(),
  transport: mockTransport,
});
```

## Contributing

See the main repository for contribution guidelines.

## License

MIT
