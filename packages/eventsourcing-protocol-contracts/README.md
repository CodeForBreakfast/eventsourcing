# @codeforbreakfast/eventsourcing-protocol-contracts

Transport-agnostic protocol abstractions for event sourcing systems. This package defines how event sourcing concepts map to transport messages, providing interfaces that work over any transport implementation (WebSocket, HTTP, SSE, etc.).

## Features

- **Transport Agnostic**: Protocol abstractions that work over any transport layer
- **Type Safe**: Full TypeScript support with Effect integration
- **Event Sourcing Focus**: Specialized for event sourcing patterns (aggregates, commands, streams)
- **Message Schemas**: Comprehensive protocol message definitions with validation
- **Service Abstractions**: Clean service interfaces following modern Effect patterns

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-protocol-contracts
```

## Core Concepts

### Protocol Types

The package defines core event sourcing types that are transport-independent:

```typescript
import {
  StreamEvent,
  Aggregate,
  AggregateCommand,
  CommandResult,
  CommandError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// A stream event with position and metadata
interface StreamEvent<TEvent> {
  readonly position: EventStreamPosition;
  readonly event: TEvent;
  readonly timestamp: Date;
}

// Command targeting a specific aggregate
interface AggregateCommand<TPayload> {
  readonly aggregate: Aggregate;
  readonly commandName: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
}
```

### Protocol Messages

Transport-agnostic message schemas for client-server communication:

```typescript
import {
  ProtocolMessage,
  ClientMessage,
  ServerMessage,
  createSubscribeMessage,
  createCommandMessage,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// Create a subscription message
const subscribeMsg = createSubscribeMessage('user-123', {
  fromPosition: 0,
  includeMetadata: true,
});

// Create a command message
const commandMsg = createCommandMessage(
  { position: { streamId: 'user-123', eventNumber: 5 }, name: 'User' },
  'updateProfile',
  { email: 'user@example.com' }
);
```

### Service Abstractions

Protocol service interfaces that work over any transport:

```typescript
import {
  EventSourcingProtocol,
  EventSourcingProtocolConnector,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// Use the protocol connector service
const useProtocol = Effect.gen(function* () {
  const connector = yield* EventSourcingProtocolConnector;

  return yield* Scope.use(
    (scope) => connector.connect('ws://localhost:3000', { userId: 'user-123' }),
    (protocol) =>
      Effect.gen(function* () {
        // Subscribe to events
        const events = yield* protocol.subscribe({
          streamId: 'user-123',
          eventNumber: 0,
        });

        // Send a command
        const result = yield* protocol.sendCommand({
          aggregate: { position: { streamId: 'user-123', eventNumber: 5 }, name: 'User' },
          commandName: 'updateProfile',
          payload: { email: 'new@example.com' },
        });

        return { events, result };
      })
  );
});
```

## Architecture

This package sits between transport implementations and event sourcing applications:

```
Application Code
       ↑
Protocol Contracts (this package)
       ↑
Transport Contracts
       ↑
Transport Implementation (WebSocket, HTTP, etc.)
```

The protocol contracts define:

1. **Domain Types**: Event sourcing specific types (aggregates, commands, streams)
2. **Message Schemas**: Protocol messages with validation
3. **Service Interfaces**: Clean abstractions for protocol operations
4. **Error Types**: Event sourcing specific error handling

## Dependencies

- `@codeforbreakfast/eventsourcing-transport-contracts` - Base transport abstractions
- `@codeforbreakfast/eventsourcing-store` - Core event sourcing types
- `effect` - Functional programming library with type-safe error handling

## Package Structure

```
src/
├── lib/
│   ├── protocol-types.ts      # Core event sourcing types
│   ├── protocol-messages.ts   # Message schemas and validation
│   └── protocol-service.ts    # Service interfaces and abstractions
└── index.ts                   # Public API exports
```

## Error Handling

The package provides specialized error types for event sourcing scenarios:

```typescript
import {
  CommandError,
  StreamError,
  ProtocolSerializationError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// Command processing errors
class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string;
  readonly aggregate?: Aggregate;
  readonly commandName?: string;
}> {}

// Stream subscription errors
class StreamError extends Data.TaggedError('StreamError')<{
  readonly message: string;
  readonly streamId?: EventStreamId;
  readonly position?: EventStreamPosition;
}> {}
```

## Usage with Different Transports

This package is designed to work with any transport implementation:

### WebSocket Transport

```typescript
// WebSocket implementation can use these protocols
const webSocketProtocol = createWebSocketProtocol(protocolContracts);
```

### HTTP Transport

```typescript
// HTTP implementation can use the same protocols
const httpProtocol = createHttpProtocol(protocolContracts);
```

### Server-Sent Events

```typescript
// SSE implementation can use the same protocols
const sseProtocol = createSSEProtocol(protocolContracts);
```

## License

MIT
