# @codeforbreakfast/eventsourcing-testing-contracts

Comprehensive testing utilities for event sourcing implementations. This package provides test contracts, mock implementations, and testing utilities to validate any event sourcing transport or protocol implementation.

## Features

✅ **Complete Test Coverage** - Test contracts for transport, protocol, and integration scenarios
✅ **Transport Agnostic** - Works with WebSocket, HTTP, SSE, or any custom transport
✅ **Protocol Agnostic** - Tests core event sourcing behaviors regardless of message format
✅ **Mock Implementations** - Ready-to-use mocks for testing your implementations
✅ **Test Data Generators** - Utilities to generate test data and scenarios
✅ **Best Practices** - Testing patterns and documentation for event sourcing systems

## Installation

```bash
bun add -D @codeforbreakfast/eventsourcing-testing-contracts
```

## Test Categories

### 1. Domain Contract Tests

Test pure event sourcing domain behaviors that any implementation must respect.

Note: This package currently focuses on transport-layer testing contracts. For domain-level event sourcing testing, you would need to implement your own test suite based on your aggregate and command handling logic.

**Required Behaviors:**

- Event ordering guarantees within streams
- Optimistic concurrency control
- Aggregate consistency and business invariants
- Atomic command processing (all-or-nothing)
- Exactly-once command processing semantics
- No gaps in event numbers
- Stream isolation

### 2. Transport Contract Tests

Test low-level message transport behaviors using comprehensive contract tests. The transport testing system includes separate contracts for client-side, server-side, and integrated client-server scenarios.

#### Client Transport Contracts

Test client-side transport implementations. For complete working examples, see:

**WebSocket Implementation:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 36-116)
- Shows how to create test context with `WebSocketConnector.connect()`
- Demonstrates proper scope-based resource management
- Includes real error handling and random port allocation

**InMemory Implementation:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 35-126)
- Shows how to handle server instance sharing for in-memory transports
- Demonstrates direct connection patterns without network protocols

#### Server Transport Contracts

Test server-side transport implementations that handle multiple clients. See the server transport implementations in:

**WebSocket Server Implementation:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 45-74)
- Uses `WebSocketAcceptor.make({ port, host })` with random port allocation
- Shows proper server startup with scope-based cleanup
- Demonstrates connection stream mapping to client transport interface

**InMemory Server Implementation:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 44-78)
- Uses `InMemoryAcceptor.make()` for direct in-memory connections
- Shows shared server instance pattern for coordinated client-server testing
- Demonstrates server lifecycle management without network concerns

Note: These examples focus on client-server integration tests. Dedicated server-only contract tests would require separate server test implementations.

#### Client-Server Integration Contracts

Test bidirectional communication between paired client and server transports.

**Real-World Implementations:**

- [WebSocket integration tests](../eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts) - Lines 88-134
- [InMemory integration tests](../eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts) - Lines 105-161

**Example: WebSocket Transport Integration**

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  makeTransportMessage,
  Server,
} from '@codeforbreakfast/eventsourcing-transport';
import {
  runClientServerContractTests,
  type ClientServerTestContext,
  type TransportPair,
  type ClientTransport,
  type ServerTransport,
  waitForConnectionState as defaultWaitForConnectionState,
  collectMessages as defaultCollectMessages,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

declare const WebSocketConnector: {
  connect: (url: string) => Effect.Effect<
    {
      readonly connectionState: Stream.Stream<ConnectionState, never, never>;
      readonly publish: (msg: TransportMessage) => Effect.Effect<void, Error, never>;
      readonly subscribe: (
        filter?: (msg: TransportMessage) => boolean
      ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
    },
    Error,
    never
  >;
};

declare const WebSocketAcceptor: {
  make: (config: {
    port: number;
    host: string;
  }) => Effect.Effect<{ start: () => Effect.Effect<Server.Transport, Error, never> }, Error, never>;
};

const mapConnectionForContract = (conn: Server.ClientConnection) => ({
  id: String(conn.clientId),
  transport: {
    connectionState: conn.transport.connectionState,
    publish: (msg: TransportMessage) =>
      pipe(
        msg,
        conn.transport.publish,
        Effect.mapError(() => new Error('Failed to publish message'))
      ),
    subscribe: (filter?: (msg: TransportMessage) => boolean) =>
      pipe(
        filter,
        conn.transport.subscribe,
        Effect.mapError(() => new Error('Failed to subscribe'))
      ),
  } satisfies ClientTransport,
});

const mapServerTransportForContract = (transport: Server.Transport): ServerTransport => ({
  connections: pipe(transport.connections, Stream.map(mapConnectionForContract)),
  broadcast: (message: TransportMessage) =>
    pipe(
      message,
      transport.broadcast,
      Effect.mapError(() => new Error('Failed to broadcast'))
    ),
});

const mapClientTransportForContract = (transport: {
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;
  readonly publish: (msg: TransportMessage) => Effect.Effect<void, Error, never>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, Error, never>;
}): ClientTransport => ({
  connectionState: transport.connectionState,
  publish: (msg: TransportMessage) =>
    pipe(
      msg,
      transport.publish,
      Effect.mapError(() => new Error('Failed to publish message'))
    ),
  subscribe: (filter?: (msg: TransportMessage) => boolean) =>
    pipe(
      filter,
      transport.subscribe,
      Effect.mapError(() => new Error('Failed to subscribe'))
    ),
});

const createWebSocketTestContext = (): Effect.Effect<ClientServerTestContext, never, never> =>
  Effect.succeed({
    makeTransportPair: (): TransportPair => {
      const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
      const host = 'localhost';
      const url = `ws://${host}:${port}`;

      return {
        makeServer: () =>
          pipe(
            { port, host },
            WebSocketAcceptor.make,
            Effect.flatMap((acceptor) => acceptor.start()),
            Effect.map(mapServerTransportForContract)
          ),

        makeClient: () =>
          pipe(
            url,
            WebSocketConnector.connect,
            Effect.map(mapClientTransportForContract),
            Effect.mapError(() => new Error('Failed to connect to server'))
          ),
      };
    },

    waitForConnectionState: (
      transport: ClientTransport,
      expectedState: ConnectionState,
      timeoutMs?: number
    ) => defaultWaitForConnectionState(transport.connectionState, expectedState, timeoutMs),

    collectMessages: defaultCollectMessages,

    makeTestMessage: (type: string, payload: unknown) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      return makeTransportMessage(id, type, JSON.stringify(payload));
    },
  });

runClientServerContractTests('WebSocket', createWebSocketTestContext);
```

**Example: InMemory Transport Integration**

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  TransportMessage,
  ConnectionState,
  makeTransportMessage,
} from '@codeforbreakfast/eventsourcing-transport';
import {
  runClientServerContractTests,
  type ClientServerTestContext,
  type TransportPair,
  type ClientTransport,
  type ServerTransport,
  waitForConnectionState as defaultWaitForConnectionState,
  collectMessages as defaultCollectMessages,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

type InMemoryServer = {
  readonly connections: Stream.Stream<
    {
      readonly clientId: string;
      readonly transport: {
        readonly connectionState: Stream.Stream<ConnectionState>;
        readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
        readonly subscribe: (
          filter?: (msg: TransportMessage) => boolean
        ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
      };
    },
    never,
    never
  >;
  readonly broadcast: (message: TransportMessage) => Effect.Effect<void, unknown>;
  readonly connector: () => Effect.Effect<
    {
      readonly connectionState: Stream.Stream<ConnectionState>;
      readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
      readonly subscribe: (
        filter?: (msg: TransportMessage) => boolean
      ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
    },
    never,
    never
  >;
};

declare const InMemoryAcceptor: {
  make: () => Effect.Effect<
    { start: () => Effect.Effect<InMemoryServer, never, never> },
    never,
    never
  >;
};

const wrapPublish =
  (transport: { readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown> }) =>
  (msg: TransportMessage) =>
    pipe(
      msg,
      transport.publish,
      Effect.mapError(() => new Error('Failed to publish message'))
    );

const wrapSubscribe =
  (transport: {
    readonly subscribe: (
      filter?: (msg: TransportMessage) => boolean
    ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
  }) =>
  (filter?: (msg: TransportMessage) => boolean) =>
    pipe(
      filter,
      transport.subscribe,
      Effect.mapError(() => new Error('Failed to subscribe'))
    );

const wrapBroadcast =
  (transport: {
    readonly broadcast: (message: TransportMessage) => Effect.Effect<void, unknown>;
  }) =>
  (message: TransportMessage) =>
    pipe(
      message,
      transport.broadcast,
      Effect.mapError(() => new Error('Failed to broadcast'))
    );

const mapServerConnection = (conn: {
  readonly clientId: string;
  readonly transport: {
    readonly connectionState: Stream.Stream<ConnectionState>;
    readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
    readonly subscribe: (
      filter?: (msg: TransportMessage) => boolean
    ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
  };
}) => ({
  id: String(conn.clientId),
  transport: {
    connectionState: conn.transport.connectionState,
    publish: wrapPublish(conn.transport),
    subscribe: wrapSubscribe(conn.transport),
  } satisfies ClientTransport,
});

const mapServerConnections = (transport: InMemoryServer) =>
  pipe(transport.connections, Stream.map(mapServerConnection));

const createServerTransport = (transport: InMemoryServer): ServerTransport => ({
  connections: mapServerConnections(transport),
  broadcast: wrapBroadcast(transport),
});

const createClientTransport = (transport: {
  readonly connectionState: Stream.Stream<ConnectionState>;
  readonly publish: (msg: TransportMessage) => Effect.Effect<void, unknown>;
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage>, unknown>;
}): ClientTransport => ({
  connectionState: transport.connectionState,
  publish: wrapPublish(transport),
  subscribe: wrapSubscribe(transport),
});

const createInMemoryTestContext = (): Effect.Effect<ClientServerTestContext, never, never> =>
  Effect.succeed({
    makeTransportPair: (): TransportPair => {
      let serverInstance: InMemoryServer | null = null;

      return {
        makeServer: () =>
          pipe(
            InMemoryAcceptor.make(),
            Effect.flatMap((acceptor) => acceptor.start()),
            Effect.tap((server) =>
              Effect.sync(() => {
                serverInstance = server;
              })
            ),
            Effect.map(createServerTransport)
          ),

        makeClient: () =>
          pipe(
            () => {
              if (!serverInstance) {
                throw new Error('Server must be created before client');
              }
              return serverInstance;
            },
            Effect.sync,
            Effect.flatMap((server) => server.connector()),
            Effect.map(createClientTransport),
            Effect.mapError(() => new Error('Failed to connect to server'))
          ),
      };
    },

    waitForConnectionState: (
      transport: ClientTransport,
      expectedState: ConnectionState,
      timeoutMs?: number
    ) => defaultWaitForConnectionState(transport.connectionState, expectedState, timeoutMs),

    collectMessages: defaultCollectMessages,

    makeTestMessage: (type: string, payload: unknown) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      return makeTransportMessage(id, type, JSON.stringify(payload));
    },
  });

runClientServerContractTests('InMemory', createInMemoryTestContext);
```

Both implementations also include transport-specific tests that verify implementation details beyond the standard contracts.

**Required Client Behaviors:**

- Scope-based connection lifecycle management
- Message publishing with various payload types
- Message subscription with optional filtering
- Connection state monitoring via streams
- Automatic resource cleanup when scopes close

**Required Server Behaviors:**

- Multiple client connection tracking
- Message broadcasting to all connected clients
- Individual client communication
- Connection counting and lifecycle management
- Resource cleanup during server shutdown

**For detailed documentation on transport contracts, see:** [`packages/eventsourcing-testing-contracts/src/lib/transport/README.md`](./src/lib/transport/README.md)

### 3. Event Sourcing Transport Tests

Extended transport tests specifically for event sourcing scenarios.

Note: This package currently focuses on generic transport contracts. Event sourcing-specific transport tests would be implemented as part of your event sourcing protocol layer.

**Additional Features:**

- Event stream filtering by pattern
- Event ordering within streams
- Event replay from specific positions
- Transport metrics and monitoring
- Event sourcing specific error handling

### 4. Integration Test Suite

Test the integration between transport layer and event sourcing concepts.

Note: This package provides the building blocks for transport testing. Integration tests combining transport with event sourcing protocols would be implemented in your protocol layer packages.

## Mock Implementations

### Mock Transport

```typescript
import { Effect, pipe } from 'effect';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import { makeMockTransport } from '@codeforbreakfast/eventsourcing-testing-contracts';

const program = Effect.scoped(
  pipe(
    makeMockTransport(),
    Effect.flatMap((transport) => {
      const testMessage = makeTransportMessage(
        'msg-123',
        'test-type',
        JSON.stringify({ data: 'value' })
      );

      return pipe(
        transport.publish(testMessage),
        Effect.flatMap(() => transport.subscribe()),
        Effect.map((subscription) => ({ transport, subscription }))
      );
    })
  )
);

await Effect.runPromise(program);
```

## Test Data Generators

```typescript
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import {
  generateMessageId,
  makeTestMessage,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// Generate unique message ID
const messageId = generateMessageId();

// Create transport message with proper typing
const transportMessage = makeTransportMessage(
  messageId,
  'UserUpdated',
  JSON.stringify({ userId: 123, value: 42 })
);

// Create simple test message
const simpleMessage = makeTestMessage('test-type', 'test-payload');
```

## Test Utilities

### Wait for Conditions

```typescript
import { Effect, Ref, pipe } from 'effect';
import { waitForCondition } from '@codeforbreakfast/eventsourcing-testing-contracts';

const program = pipe(
  Ref.make(false),
  Effect.flatMap((isConnectedRef) => waitForCondition(() => Ref.get(isConnectedRef), 5000, 100))
);

await Effect.runPromise(program);
```

### Collect Stream with Timeout

```typescript
import { Effect, Stream, pipe } from 'effect';
import { collectStreamWithTimeout } from '@codeforbreakfast/eventsourcing-testing-contracts';

const eventStream = Stream.make('event1', 'event2', 'event3');

const events = await pipe(
  eventStream,
  (stream) => collectStreamWithTimeout(stream, 3000),
  Effect.runPromise
);
```

### Common Test Scenarios

For common test scenarios, refer to the contract test implementations in this package. The contract tests demonstrate best practices for:

- Testing connection lifecycle management
- Testing message publishing and subscription
- Testing concurrent operations
- Testing error handling scenarios

## Complete Example

For complete working examples of using the transport contract tests, see the actual transport implementations:

**WebSocket Transport Testing:**

- [WebSocket integration tests](../eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts)
- Full implementation showing `runClientServerContractTests` usage
- Demonstrates proper scope management and resource cleanup
- Includes WebSocket-specific tests beyond the standard contracts

**InMemory Transport Testing:**

- [InMemory integration tests](../eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts)
- Shows in-memory transport testing patterns
- Demonstrates shared server instance pattern
- Includes simpler testing scenarios without network concerns

### Basic Usage Example

```typescript
import { describe, it, expect } from 'bun:test';
import { Effect, pipe } from 'effect';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import {
  makeMockTransport,
  collectMessages,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

describe('My Transport', () => {
  it('should publish and receive messages', async () => {
    const program = Effect.scoped(
      pipe(
        makeMockTransport(),
        Effect.flatMap((transport) => {
          const message = makeTransportMessage(
            'msg-123',
            'test-type',
            JSON.stringify({ data: 'value' })
          );

          return pipe(
            transport.publish(message),
            Effect.flatMap(() => transport.subscribe()),
            Effect.flatMap((messageStream) => collectMessages(messageStream, 1, 1000)),
            Effect.map((messages) => ({ messages, transport }))
          );
        }),
        Effect.map(({ messages }) => messages)
      )
    );

    const messages = await Effect.runPromise(program);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('test-type');
  });
});
```

## Best Practices

### 1. Test Organization

- **Separate concerns:** Use domain tests for event sourcing rules, transport tests for message delivery
- **Feature flags:** Declare which optional behaviors your transport supports
- **Test isolation:** Each test should be independent with unique stream IDs
- **Resource cleanup:** Always clean up resources after each test

### 2. Mock Strategies

- **Domain tests:** Mock the event store backend
- **Transport tests:** Mock the network layer
- **Integration tests:** Mock the server/backend

### 3. Error Testing

```typescript
import { Effect, pipe } from 'effect';
import { expectError } from '@codeforbreakfast/eventsourcing-testing-contracts';

class ValidationError {
  readonly _tag = 'ValidationError';
  constructor(readonly message: string) {}
}

const invalidOperation = Effect.fail(new ValidationError('validation failed'));

await pipe(
  invalidOperation,
  (effect) => expectError(effect, (error) => error._tag === 'ValidationError'),
  Effect.runPromise
);
```

### 4. Performance Testing

```typescript
import { Effect, pipe } from 'effect';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import { makeMockTransport } from '@codeforbreakfast/eventsourcing-testing-contracts';
import { expect } from 'bun:test';

const program = Effect.scoped(
  pipe(
    makeMockTransport(),
    Effect.flatMap((transport) => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        makeTransportMessage(`perf-test-${i}`, 'perf-test', JSON.stringify({ value: i }))
      );

      const startTime = Date.now();

      return pipe(
        Effect.all(
          messages.map((msg) => transport.publish(msg)),
          { concurrency: 'unbounded' }
        ),
        Effect.map(() => Date.now() - startTime)
      );
    })
  )
);

const duration = await Effect.runPromise(program);
expect(duration).toBeLessThan(1000);
```

## Feature Support Matrix

| Feature               | Required | WebSocket | HTTP | SSE |
| --------------------- | -------- | --------- | ---- | --- |
| Connection Management | ✅       | ✅        | ✅   | ✅  |
| Event Subscription    | ✅       | ✅        | ❌   | ✅  |
| Command Processing    | ✅       | ✅        | ✅   | ❌  |

Legend: ✅ Supported | ❌ Not Supported

## License

MIT - See LICENSE file for details
