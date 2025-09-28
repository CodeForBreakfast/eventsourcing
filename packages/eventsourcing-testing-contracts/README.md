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

Test pure event sourcing domain behaviors that any implementation must respect:

```typescript
import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';

runDomainContractTests('My Implementation', () => {
  return Effect.succeed({
    processCommand: (cmd) => myBackend.processCommand(cmd),
    getEventCount: (streamId) => myBackend.getEventCount(streamId),
    getLastEventNumber: (streamId) => myBackend.getLastEventNumber(streamId),
    reset: () => myBackend.reset(),
  });
});
```

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

Test bidirectional communication between paired client and server transports. For complete integration examples, see:

**WebSocket Integration:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 38-95)
- Shows `TransportPair` implementation with random port allocation
- Demonstrates real WebSocket server/client coordination
- Includes proper error mapping and connection state management
- Line 116: `runClientServerContractTests('WebSocket', createWebSocketTestContext)`

**InMemory Integration:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 37-104)
- Shows shared server instance pattern for synchronized testing
- Demonstrates direct connection without network protocols
- Line 126: `runClientServerContractTests('InMemory', createInMemoryTestContext)`

Both implementations also include transport-specific tests (lines 122+ in WebSocket, lines 132+ in InMemory) that test implementation details beyond the standard contracts.

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

Extended transport tests specifically for event sourcing scenarios:

```typescript
import { runEventSourcingTransportTests } from '@codeforbreakfast/eventsourcing-testing-contracts';

runEventSourcingTransportTests('WebSocket', () => setupEventSourcingTransportContext(), {
  supportsEventOrdering: true,
  supportsEventReplay: true,
  supportsStreamFiltering: true,
  supportsMetrics: true,
});
```

**Additional Features:**

- Event stream filtering by pattern
- Event ordering within streams
- Event replay from specific positions
- Transport metrics and monitoring
- Event sourcing specific error handling

### 4. Integration Test Suite

Test the integration between transport layer and event sourcing concepts:

```typescript
import { runIntegrationTestSuite } from '@codeforbreakfast/eventsourcing-testing-contracts';

runIntegrationTestSuite(
  'WebSocket',
  () => EventTransportLive('ws://localhost:8080'),
  setupMockServer, // Optional mock server for testing
  {
    supportsStreamFiltering: true,
    supportsCommandPipelining: true,
  }
);
```

**Test Categories:**

- **REQUIRED:** Must be correctly implemented by all transports
- **OPTIONAL:** May be implemented based on transport capabilities
- **IMPLEMENTATION-SPECIFIC:** Varies by transport type

## Mock Implementations

### Mock Transport

```typescript
import { createMockTransport } from '@codeforbreakfast/eventsourcing-testing-contracts';

const mockTransport = await Effect.runPromise(createMockTransport());

// Use in your tests
await Effect.runPromise(mockTransport.connect());
await Effect.runPromise(mockTransport.publish(testMessage));
```

### Mock Domain Context

```typescript
import { createMockDomainContext } from '@codeforbreakfast/eventsourcing-testing-contracts';

const mockDomain = await Effect.runPromise(createMockDomainContext());

// Test command processing
const result = await Effect.runPromise(mockDomain.processCommand(testCommand));
```

## Test Data Generators

```typescript
import {
  generateStreamId,
  createTestCommand,
  createTestStreamEvent,
  generateTestEvents,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// Generate unique stream IDs
const streamId = generateStreamId('user-stream');

// Create test commands
const command = createTestCommand(
  { action: 'update', value: 42 },
  {
    aggregateName: 'User',
    commandName: 'UpdateProfile',
    position: { streamId, eventNumber: 0 },
  }
);

// Generate sequences of test events
const events = generateTestEvents(
  (i) => ({ type: 'UserUpdated', data: `update-${i}` }),
  10,
  streamId
);
```

## Test Utilities

### Wait for Conditions

```typescript
import { waitForCondition } from '@codeforbreakfast/eventsourcing-testing-contracts';

await Effect.runPromise(
  waitForCondition(
    () => transport.isConnected(),
    5000, // timeout ms
    100 // check interval ms
  )
);
```

### Collect Stream with Timeout

```typescript
import { collectStreamWithTimeout } from '@codeforbreakfast/eventsourcing-testing-contracts';

const events = await Effect.runPromise(
  collectStreamWithTimeout(
    eventStream,
    5, // expected count
    3000 // timeout ms
  )
);
```

### Common Test Scenarios

```typescript
import { TestScenarios } from '@codeforbreakfast/eventsourcing-testing-contracts';

// Test basic command flow
const result = await Effect.runPromise(TestScenarios.basicCommandFlow(processCommand));

// Test optimistic concurrency
const { result1, result2 } = await Effect.runPromise(
  TestScenarios.optimisticConcurrency(processCommand)
);
```

## Complete Example

```typescript
import { describe } from 'bun:test';
import {
  runDomainContractTests,
  runTransportContractTests,
  runEventSourcingTransportTests,
  runIntegrationTestSuite,
  createMockDomainContext,
  createMockTransport,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

describe('My WebSocket Transport', () => {
  // Test domain contracts
  runDomainContractTests('WebSocket', () => createMockDomainContext());

  // Test transport contracts
  runTransportContractTests('WebSocket', () => createMockTransport());

  // Test event sourcing specific transport features
  runEventSourcingTransportTests('WebSocket', () => setupEventSourcingContext(), {
    supportsEventOrdering: true,
    supportsStreamFiltering: true,
  });

  // Test integration
  runIntegrationTestSuite('WebSocket', () => makeTransportLayer(), setupMockServer, {
    supportsStreamFiltering: true,
  });

  // Add implementation-specific tests
  describe('WebSocket-specific features', () => {
    it('should handle binary frames', () => {
      // Custom test for WebSocket-specific behavior
    });

    it('should handle WebSocket close codes correctly', () => {
      // Test proper handling of different close codes
    });
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
import { expectError } from '@codeforbreakfast/eventsourcing-testing-contracts';

// Test that an effect fails with expected error
await Effect.runPromise(
  expectError(invalidOperation(), (error) => error.message.includes('validation'))
);
```

### 4. Performance Testing

```typescript
// Test command throughput
const commands = generateTestCommands((i) => ({ value: i }), 100);
const startTime = Date.now();

const results = await Effect.runPromise(
  Effect.all(
    commands.map((cmd) => transport.sendCommand(cmd)),
    { concurrency: 'unbounded' }
  )
);

const duration = Date.now() - startTime;
expect(duration).toBeLessThan(1000); // Should process 100 commands in <1s
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
