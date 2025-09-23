# @codeforbreakfast/eventsourcing-transport-inmemory

A high-performance in-memory transport implementation for event sourcing applications.

## Features

- **Direct in-memory message passing** for maximum performance
- **Multiple client support** - many clients can connect to the same server
- **Proper connection state management** using Effect's PubSub
- **Bidirectional message flow** with optional filtering
- **Resource-safe cleanup** with Effect.acquireRelease
- **Full contract compliance** for testing and single-process applications

## Usage

### Basic Client-Server Connection

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  InMemoryConnector,
  InMemoryAcceptor,
} from '@codeforbreakfast/eventsourcing-transport-inmemory';

// Start a server
const serverEffect = Effect.scoped(
  pipe(
    InMemoryAcceptor.make({ serverId: 'my-server' }),
    Effect.flatMap((acceptor) => acceptor.start()),
    Effect.flatMap((serverTransport) => {
      // Handle incoming client connections
      return pipe(
        serverTransport.connections,
        Stream.runForEach((connection) => {
          console.log(`Client connected: ${connection.clientId}`);
          return Effect.void;
        })
      );
    })
  )
);

// Connect a client
const clientEffect = Effect.scoped(
  pipe(
    InMemoryConnector.connect('inmemory://my-server'),
    Effect.flatMap((clientTransport) => {
      // Send a message to the server
      return clientTransport.publish({
        id: 'msg-1',
        type: 'hello',
        payload: { message: 'Hello server!' },
        metadata: {},
      });
    })
  )
);

// Run both effects
await Effect.runPromise(Effect.all([serverEffect, clientEffect], { concurrency: 2 }));
```

### Using with Effect.Tag

```typescript
import { Layer } from 'effect';
import { Client } from '@codeforbreakfast/eventsourcing-transport-contracts';
import { InMemoryTransportLive } from '@codeforbreakfast/eventsourcing-transport-inmemory';

const program = pipe(
  Client.Connector,
  Effect.flatMap((connector) => connector.connect('inmemory://test-server')),
  Effect.provide(InMemoryTransportLive)
);
```

## Configuration

### Server Configuration

```typescript
interface InMemoryServerConfig {
  readonly serverId: string;
}
```

### URL Format

Clients connect using URLs in the format: `inmemory://<server-id>`

## Architecture

The transport uses a simple registry pattern where:

1. **Server Registration**: When a server starts, it registers itself in a global registry with its server ID
2. **Client Connection**: Clients connect by looking up the server in the registry
3. **Message Passing**: Direct queue-to-queue communication for high performance
4. **Connection Tracking**: Server tracks all client connections and can broadcast to all clients

## Performance

This transport is optimized for single-process applications where maximum performance is needed:

- **Zero serialization overhead** - messages are passed directly as objects
- **Direct queue operations** - no network or IPC overhead
- **Minimal state management** - uses Effect's efficient Ref and Queue primitives

## Testing

The transport includes comprehensive tests and is fully compatible with the transport contract tests:

```bash
bun test
```

## License

MIT
