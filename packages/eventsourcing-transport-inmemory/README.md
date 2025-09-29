# @codeforbreakfast/eventsourcing-transport-inmemory

Pure functional in-memory transport implementation for event sourcing with **zero global state**.

## Key Features

- **Pure Functional**: No global state, no singletons, no classes
- **Multiple Isolated Servers**: Each server is completely independent
- **Direct Connection**: Clients connect directly to specific server instances
- **Type Safe**: Full TypeScript support with Effect types
- **High Performance**: Direct in-memory message passing

## Basic Usage

### Creating a Server

```typescript
import { Effect, Stream, pipe } from 'effect';
import { InMemoryAcceptor } from '@codeforbreakfast/eventsourcing-transport-inmemory';

const program = Effect.gen(function* () {
  // Create and start a server
  const acceptor = yield* InMemoryAcceptor.make();
  const server = yield* acceptor.start();

  // Server provides:
  // - connections: Stream of client connections
  // - broadcast: Function to send messages to all clients
  // - connector: Function for clients to connect to this server

  return server;
});
```

### Connecting Clients

```typescript
const program = Effect.gen(function* () {
  const acceptor = yield* InMemoryAcceptor.make();
  const server = yield* acceptor.start();

  // Connect clients using the server's connector
  const client1 = yield* server.connector('inmemory://client1');
  const client2 = yield* server.connector('inmemory://client2');

  // Both clients are now connected to the same server
  return { server, client1, client2 };
});
```

### Multiple Isolated Servers

```typescript
const program = Effect.gen(function* () {
  // Create two completely isolated servers
  const [server1, server2] = yield* Effect.all([
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start())
    ),
    pipe(
      InMemoryAcceptor.make(),
      Effect.flatMap((acceptor) => acceptor.start())
    ),
  ]);

  // Connect clients to different servers
  const client1 = yield* server1.connector('inmemory://test');
  const client2 = yield* server2.connector('inmemory://test');

  // client1 and client2 are on completely different servers
  return { server1, server2, client1, client2 };
});
```

### Messaging Example

```typescript
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';

const program = Effect.gen(function* () {
  const acceptor = yield* InMemoryAcceptor.make();
  const server = yield* acceptor.start();
  const client = yield* server.connector('inmemory://test');

  // Subscribe to messages
  const messageStream = yield* client.subscribe();

  // Broadcast a message
  const message = makeTransportMessage('msg-1', 'test-event', { data: 'hello' });
  yield* server.broadcast(message);

  // Receive the message
  const receivedMessage = yield* pipe(messageStream, Stream.take(1), Stream.runHead);

  console.log('Received:', receivedMessage);
});

Effect.runPromise(Effect.scoped(program));
```

## Why This Design?

### Problems with Global State

The old design used a global registry singleton that caused:

- **Test Isolation Issues**: Tests couldn't run in parallel
- **Memory Leaks**: Cleanup was unreliable
- **Coupling**: All servers shared the same global state
- **Functional Impurity**: Global mutable state breaks referential transparency

### Pure Functional Solution

The new design:

- **No Global State**: Each server is completely isolated
- **Direct Connection**: Clients connect to specific server instances
- **Resource Safety**: Proper cleanup through Effect's resource management
- **Composable**: Multiple servers can coexist without interference
- **Testable**: Perfect isolation between test cases

## Type Safety

```typescript
import type {
  InMemoryServer,
  InMemoryConnector,
} from '@codeforbreakfast/eventsourcing-transport-inmemory';

// Server type
const server: InMemoryServer = {
  connections: Stream<Server.ClientConnection>,
  broadcast: (message: TransportMessage) => Effect<void>,
  connector: InMemoryConnector,
};

// Connector type
const connector: InMemoryConnector = (url: string) =>
  Effect<Client.Transport<TransportMessage>, ConnectionError, Scope>;
```

## Testing

Perfect for contract testing with complete isolation:

```typescript
describe('My Tests', () => {
  test('isolated server per test', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // Each test gets its own isolated server
          const acceptor = yield* InMemoryAcceptor.make();
          const server = yield* acceptor.start();
          const client = yield* server.connector('inmemory://test');

          // Test your logic here...
        })
      )
    );
  });
});
```

This is how proper functional programming should work - no global state, no surprises, just pure composable functions.

## License

MIT
