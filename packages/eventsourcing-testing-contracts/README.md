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

Test low-level message transport behaviors without event sourcing concepts:

```typescript
import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';

runTransportContractTests(
  'WebSocket',
  () => {
    const transport = new MyTransport();
    return Effect.succeed({
      connect: () => transport.connect(),
      disconnect: () => transport.disconnect(),
      isConnected: () => transport.isConnected(),
      subscribe: (filter) => transport.subscribe(filter),
      publish: (msg) => transport.publish(msg),
      request: (req, timeout) => transport.request(req, timeout),
      getConnectionState: () => transport.getConnectionState(),
      getBufferedMessageCount: () => transport.getBufferedMessageCount(),
      // Optional features
      simulateDisconnect: () => transport.simulateDisconnect(),
      simulateReconnect: () => transport.simulateReconnect(),
    });
  },
  {
    // Declare which optional features your transport supports
    supportsReconnection: true,
    supportsOfflineBuffering: false,
    supportsBackpressure: true,
    guaranteesOrdering: true,
    supportsMultiplexing: true,
  }
);
```

**Required Behaviors:**

- Connection establishment and teardown
- Message delivery to correct subscribers
- Multiple subscribers per message type
- Request/response with timeout
- Resource cleanup on disconnect
- Error handling for malformed messages

**Optional Behaviors (declare via feature flags):**

- Reconnection after network failure
- Offline message buffering
- Backpressure handling
- Message ordering guarantees
- Multiplexing support

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
    supportsReconnection: true,
    supportsOfflineBuffering: false,
    supportsBackpressure: false,
    maintainsOrderingDuringReconnect: false,
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
  runTransportContractTests('WebSocket', () => createMockTransport(), {
    supportsReconnection: true,
    guaranteesOrdering: true,
  });

  // Test event sourcing specific transport features
  runEventSourcingTransportTests('WebSocket', () => setupEventSourcingContext(), {
    supportsEventOrdering: true,
    supportsStreamFiltering: true,
  });

  // Test integration
  runIntegrationTestSuite('WebSocket', () => makeTransportLayer(), setupMockServer, {
    supportsReconnection: true,
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
| Reconnection          | ⚪       | ✅        | ❌   | ✅  |
| Offline Buffering     | ⚪       | ✅        | ❌   | ❌  |
| Message Ordering      | ⚪       | ✅        | ❌   | ✅  |
| Backpressure          | ⚪       | ✅        | ✅   | ❌  |
| Multiplexing          | ⚪       | ✅        | ✅   | ✅  |

Legend: ✅ Supported | ❌ Not Supported | ⚪ Optional

## License

MIT - See LICENSE file for details
