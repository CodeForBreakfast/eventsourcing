# Event Transport Test Architecture

This directory contains three separate test suites for validating event transport implementations:

## Test Suite Overview

### 1. Domain Contract Tests (`domain-contract.test.ts`)

Tests pure event sourcing domain behaviors that any transport + backend must respect:

**REQUIRED Behaviors:**

- Event ordering guarantees within streams
- Optimistic concurrency control
- Aggregate consistency and business invariants
- Atomic command processing (all-or-nothing)
- Exactly-once command processing semantics
- No gaps in event numbers
- Stream isolation

**Usage:**

```typescript
import { runDomainContractTests } from '@codeforbreakfast/eventsourcing-websocket-transport';

runDomainContractTests('My Transport', () => {
  return Effect.succeed({
    processCommand: (cmd) => myBackend.processCommand(cmd),
    getEventCount: (streamId) => myBackend.getEventCount(streamId),
    getLastEventNumber: (streamId) => myBackend.getLastEventNumber(streamId),
    reset: () => myBackend.reset(),
  });
});
```

### 2. Message Transport Contract Tests (`message-transport-contract.ts`)

Tests low-level message transport behaviors without event sourcing concepts:

**REQUIRED Behaviors:**

- Connection establishment and teardown
- Message delivery to correct topics/subscribers
- Multiple subscribers per topic
- Request/response with timeout
- Resource cleanup on disconnect
- Error handling for malformed messages

**OPTIONAL Behaviors (based on transport features):**

- Reconnection after network failure
- Offline message buffering
- Backpressure handling
- Message ordering guarantees
- Multiplexing support

**Usage:**

```typescript
import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-websocket-transport';

runTransportContractTests(
  'WebSocket',
  () => {
    const transport = new MyTransport();
    return Effect.succeed({
      connect: () => transport.connect(),
      disconnect: () => transport.disconnect(),
      isConnected: () => transport.isConnected(),
      subscribe: (topic) => transport.subscribe(topic),
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

### 3. Integration Test Suite (`transport-test-suite.ts`)

Tests the integration between transport layer and event sourcing concepts:

**Test Categories:**

- **REQUIRED:** Must be correctly implemented by all transports
- **OPTIONAL:** May be implemented based on transport capabilities
- **IMPLEMENTATION-SPECIFIC:** Varies by transport type

**Usage:**

```typescript
import { runEventTransportTestSuite } from '@codeforbreakfast/eventsourcing-websocket-transport';

runEventTransportTestSuite(
  'WebSocket',
  () => EventTransportLive('ws://localhost:8080', TestEventSchema),
  setupMockServer, // Optional mock server for testing
  {
    supportsReconnection: true,
    supportsOfflineBuffering: false,
    supportsBackpressure: false,
    maintainsOrderingDuringReconnect: false,
  }
);
```

## Test Organization Best Practices

### 1. Separation of Concerns

- **Domain tests:** Test event sourcing rules (optimistic concurrency, ordering, etc.)
- **Transport tests:** Test message delivery (pub/sub, connection management, etc.)
- **Integration tests:** Test the combination of both

### 2. Feature Flags

- Use feature flags to indicate which optional behaviors your transport supports
- Tests will automatically skip unsupported features

### 3. Mock Strategies

- **For domain tests:** Mock the event store backend
- **For transport tests:** Mock the network layer
- **For integration tests:** Mock the server/backend

### 4. Test Isolation

- Each test should be independent
- Use unique stream IDs to avoid conflicts
- Clean up resources after each test

### 5. Implementation-Specific Tests

Add your own tests for features unique to your transport:

```typescript
describe('WebSocket-Specific Features', () => {
  it('should support custom reconnection intervals', () => {
    // Test WebSocket-specific reconnection logic
  });

  it('should handle WebSocket close codes correctly', () => {
    // Test proper handling of different close codes
  });
});
```

## Required vs Optional Behaviors

### Always Required

- Subscribe to event streams
- Send commands and receive results
- Handle errors gracefully
- Clean up resources on disconnect
- Filter events to correct subscribers
- Handle concurrent operations

### Optional (Declare via Feature Flags)

- Automatic reconnection
- Offline message buffering
- Backpressure handling
- Message ordering during reconnect
- Multiplexing multiple streams

### Implementation-Specific

- Retry strategies
- Connection options
- Serialization formats
- Authentication methods
- Custom headers/metadata

## Example: Complete Test Suite

```typescript
import { describe } from 'bun:test';
import {
  runDomainContractTests,
  runTransportContractTests,
  runEventTransportTestSuite,
} from '@codeforbreakfast/eventsourcing-websocket-transport';

describe('My WebSocket Transport', () => {
  // Test domain contracts
  runDomainContractTests('WebSocket', setupDomainContext);

  // Test transport contracts
  runTransportContractTests('WebSocket', setupTransportContext, {
    supportsReconnection: true,
    guaranteesOrdering: true,
  });

  // Test integration
  runEventTransportTestSuite('WebSocket', makeTransport, setupMockServer, {
    supportsReconnection: true,
  });

  // Add implementation-specific tests
  describe('WebSocket-specific', () => {
    it('should handle binary frames', () => {
      // Custom test
    });
  });
});
```
