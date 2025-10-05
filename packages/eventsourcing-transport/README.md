# @codeforbreakfast/eventsourcing-transport

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

### `Client.Transport`

The main interface representing a fully connected transport that can send and receive messages:

```typescript
import { Effect, Stream, Scope } from 'effect';
import type {
  TransportMessage,
  ConnectionState,
  TransportError,
} from '@codeforbreakfast/eventsourcing-transport';

interface Transport {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (message: TransportMessage) => Effect.Effect<void, TransportError, never>;
  readonly subscribe: (
    filter?: (message: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never>;
}
```

### `Client.Connector`

The service tag for creating connected transports. This design prevents calling transport methods before establishing a connection:

```typescript
import { Context, Effect, Scope } from 'effect';
import type { Client, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';

class Connector extends Context.Tag('@transport/Client.Connector')<
  Connector,
  {
    readonly connect: (
      url: string
    ) => Effect.Effect<Client.Transport, ConnectionError, Scope.Scope>;
  }
>() {}
```

### `TransportMessage`

The base message type that all transport implementations must handle:

```typescript
import { Brand } from 'effect';
import type { TransportMessage } from '@codeforbreakfast/eventsourcing-transport';

// TransportMessage has this structure:
type MessageStructure = {
  readonly id: string & Brand.Brand<'MessageId'>;
  readonly type: string;
  readonly payload: string; // Always a JSON string - transport doesn't parse it
  readonly metadata: Record<string, unknown>;
};
```

The transport layer only validates the envelope structure. The payload is always a serialized JSON string - the transport doesn't care what's inside.

## Error Types

The package provides standardized error types:

- `TransportError` - General transport operation failures
- `ConnectionError` - Connection establishment/management failures
- `MessageParseError` - Message serialization/deserialization failures

## Contract Testing

Use `runClientTransportContractTests` from the testing contracts package to verify your transport implementation meets all requirements:

```typescript
import { runClientTransportContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
import type { TransportTestContext } from '@codeforbreakfast/eventsourcing-testing-contracts';
import { Effect, Scope } from 'effect';

const setupMyTransport = (): Effect.Effect<TransportTestContext, never, never> =>
  Effect.succeed({
    makeConnectedTransport: (url: string) =>
      Effect.scoped(
        Effect.acquireRelease(
          Effect.succeed({} as any), // Your transport creation here
          () => Effect.void
        )
      ),
  });

runClientTransportContractTests('My Transport', setupMyTransport);
```

## Usage Example

```typescript
import { Effect, Stream, pipe } from 'effect';
import { Client, makeMessageId } from '@codeforbreakfast/eventsourcing-transport';
import type { TransportMessage } from '@codeforbreakfast/eventsourcing-transport';

const useTransport = pipe(
  Client.Connector,
  Effect.andThen((connector) =>
    pipe(
      connector.connect('ws://localhost:8080'),
      Effect.andThen((transport: Client.Transport) =>
        pipe(
          // Subscribe to messages
          transport.subscribe((msg: TransportMessage) => msg.type === 'chat'),
          Effect.andThen((messageStream: Stream.Stream<TransportMessage, never, never>) =>
            pipe(
              // Send a message
              transport.publish({
                id: makeMessageId(crypto.randomUUID()),
                type: 'chat',
                payload: JSON.stringify({ text: 'Hello, world!' }),
                metadata: {},
              }),
              Effect.andThen(() =>
                // Process incoming messages
                Stream.runForEach(messageStream, (message: TransportMessage) =>
                  Effect.logInfo(`Received: ${message.payload}`)
                )
              )
            )
          )
        )
      )
    )
  )
);
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
