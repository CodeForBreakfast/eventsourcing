# Migration Guide: Upgrading to Layered Testing Framework

This guide helps you migrate from the old mixed testing approach to the new layered testing framework. The new approach provides clear separation of concerns and eliminates confusion about what each test validates.

## Overview of Changes

### Old Approach (Problems)

- ❌ Transport tests mixed with event sourcing concepts
- ❌ Domain tests included transport concerns
- ❌ Integration tests duplicated lower-level tests
- ❌ Unclear what transport implementers needed to test
- ❌ No clear guidance for different types of implementers

### New Approach (Solutions)

- ✅ **Layer 1**: Transport tests focus ONLY on message delivery
- ✅ **Layer 2**: Protocol tests focus ONLY on ES-to-transport mapping
- ✅ **Layer 3**: Domain tests focus ONLY on ES invariants
- ✅ **Layer 4**: Integration tests focus ONLY on end-to-end scenarios
- ✅ Clear guidance: implementers only test what they implement
- ✅ No duplication between layers

## Migration Steps

### Step 1: Identify Your Implementation Type

**Are you implementing a transport (WebSocket, HTTP, gRPC)?**

- ✅ You need Layer 1 (Transport Tests)
- ❌ You don't need Layer 2-4 (unless testing complete stack)

**Are you implementing a protocol (JSON, Protobuf, custom serialization)?**

- ✅ You need Layer 2 (Protocol Tests)
- ❌ You don't need Layer 1, 3-4 (unless testing complete stack)

**Are you implementing an event store (PostgreSQL, MongoDB, DynamoDB)?**

- ✅ You need Layer 3 (Domain Tests)
- ❌ You don't need Layer 1-2, 4 (unless testing complete stack)

**Are you implementing a complete stack?**

- ✅ You need all layers (1-4)

### Step 2: Update Your Imports

**Before:**

```typescript
import {
  runDomainContractTests,
  runTransportContractTests,
  runIntegrationTestSuite,
} from '@codeforbreakfast/eventsourcing-websocket-transport';
```

**After:**

```typescript
import {
  runTransportContractTests, // Layer 1
  runProtocolContractTests, // Layer 2
  runDomainContractTests, // Layer 3
  runIntegrationTestSuite, // Layer 4
} from '@codeforbreakfast/eventsourcing-testing-contracts';
```

### Step 3: Migrate Transport Tests

**Before (Mixed concerns):**

```typescript
// Old test mixed transport + event sourcing
describe('WebSocket Transport', () => {
  it('should handle event subscriptions', async () => {
    // This mixed transport mechanics with ES concepts
    const transport = new WebSocketTransport();
    await transport.connect();

    const events = await transport.subscribeToEvents(streamId);
    const command = createTestCommand();
    await transport.sendCommand(command);

    // Mixed concerns: testing both transport AND domain logic
    expect(events).toContainEvent('TestCreated');
  });
});
```

**After (Focused concerns):**

```typescript
// New Layer 1: Pure transport mechanics
describe('WebSocket Transport', () => {
  runTransportContractTests(
    'WebSocket',
    () =>
      Effect.succeed({
        connect: () => transport.connect(),
        disconnect: () => transport.disconnect(),
        isConnected: () => transport.isConnected(),
        publish: (msg) => transport.publish(msg),
        subscribe: (filter) => transport.subscribe(filter),
        getConnectionState: () => transport.getConnectionState(),
        // No event sourcing concepts here!
      }),
    {
      supportsReconnection: true,
      guaranteesMessageOrdering: true,
    }
  );
});
```

### Step 4: Migrate Protocol Tests

**Before (No clear protocol layer):**

```typescript
// Protocol logic was mixed into transport or domain tests
```

**After (Clear protocol layer):**

```typescript
// New Layer 2: ES-to-transport mapping
describe('JSON Protocol', () => {
  runProtocolContractTests(
    'JSON Protocol',
    () =>
      Effect.succeed({
        sendCommand: (cmd) => protocol.serializeAndSend(cmd),
        subscribeToEvents: (streamId, pos) => protocol.subscribeAndDeserialize(streamId, pos),
        getProtocolVersion: () => Effect.succeed('1.0'),
        isProtocolHealthy: () => Effect.succeed(true),
        reset: () => protocol.reset(),
      }),
    {
      supportsEventFiltering: true,
      supportsCompression: false,
    }
  );
});
```

### Step 5: Migrate Domain Tests

**Before (Mixed with transport concerns):**

```typescript
// Old domain tests included transport setup
describe('Event Store', () => {
  it('should handle optimistic concurrency', async () => {
    // Mixed transport setup with domain testing
    const transport = new WebSocketTransport();
    await transport.connect();
    const store = new EventStore(transport);

    // Domain logic mixed with transport concerns
    const result = await store.processCommand(command);
    expect(result).toBe(success);
  });
});
```

**After (Pure domain logic):**

```typescript
// New Layer 3: Pure ES invariants
describe('PostgreSQL Event Store', () => {
  runDomainContractTests(
    'PostgreSQL Store',
    () =>
      Effect.succeed({
        processCommand: (cmd) => store.processCommand(cmd),
        getEventCount: (streamId) => store.getEventCount(streamId),
        getLastEventNumber: (streamId) => store.getLastEventNumber(streamId),
        getEvents: (streamId, from, max) => store.getEvents(streamId, from, max),
        getAggregateVersion: (streamId) => store.getAggregateVersion(streamId),
        aggregateExists: (streamId) => store.aggregateExists(streamId),
        reset: () => store.reset(),
        // No transport concerns here!
      }),
    {
      supportsSnapshots: true,
      supportsProjections: false,
    }
  );
});
```

### Step 6: Migrate Integration Tests

**Before (Unclear scope):**

```typescript
// Old integration tests duplicated layer concerns
describe('Complete Integration', () => {
  it('should work end-to-end', async () => {
    // Tests duplicated transport, protocol, and domain concerns
    // instead of focusing on integration
  });
});
```

**After (Clear end-to-end focus):**

```typescript
// New Layer 4: End-to-end scenarios
describe('Complete Stack Integration', () => {
  runIntegrationTestSuite(
    'WebSocket + JSON + PostgreSQL',
    () =>
      Effect.succeed({
        sendCommandAndWaitForEvents: (cmd, events, timeout) =>
          stack.sendCommandAndWaitForEvents(cmd, events, timeout),
        runScenario: (scenario) => stack.runScenario(scenario),
        measureThroughput: (ops, duration) => stack.measureThroughput(ops, duration),
        testNetworkPartition: (duration) => stack.testNetworkPartition(duration),
        cleanup: () => stack.cleanup(),
      }),
    {
      supportsHighAvailability: true,
      supportsLoadBalancing: false,
    }
  );
});
```

## Common Migration Patterns

### Pattern 1: Split Mixed Transport Tests

**Before:**

```typescript
describe('WebSocket Transport', () => {
  it('should subscribe to events and receive domain events', () => {
    // Mixed transport + domain concerns
  });
});
```

**After:**

```typescript
// Layer 1: Transport mechanics only
describe('WebSocket Transport Layer', () => {
  runTransportContractTests('WebSocket', setupTransport);
});

// Layer 4: Integration with domain (if needed)
describe('WebSocket Integration', () => {
  runIntegrationTestSuite('WebSocket Stack', setupCompleteStack);
});
```

### Pattern 2: Extract Protocol Logic

**Before:**

```typescript
// Protocol logic was embedded in transport tests
const transportWithProtocol = {
  sendCommand: async (cmd) => {
    const serialized = JSON.stringify(cmd); // Protocol concern
    await websocket.send(serialized); // Transport concern
    const response = await websocket.receive(); // Transport concern
    return JSON.parse(response); // Protocol concern
  },
};
```

**After:**

```typescript
// Layer 1: Pure transport
const pureTransport = {
  publish: (msg) => websocket.send(msg),
  subscribe: () => websocket.createStream(),
};

// Layer 2: Pure protocol
const pureProtocol = {
  sendCommand: (cmd) => {
    const serialized = JSON.stringify(cmd);
    return transport.publish(serialized).then((response) => JSON.parse(response));
  },
};
```

### Pattern 3: Separate Domain from Infrastructure

**Before:**

```typescript
// Domain tests included infrastructure setup
describe('Order Aggregate', () => {
  beforeEach(async () => {
    // Infrastructure setup mixed with domain testing
    await startDatabase();
    await connectWebSocket();
    await setupEventStore();
  });

  it('should process orders', () => {
    // Domain logic + infrastructure concerns
  });
});
```

**After:**

```typescript
// Layer 3: Pure domain logic
describe('Order Domain Logic', () => {
  runDomainContractTests('Order Store', setupDomainContext);
});

// Layer 4: Infrastructure integration (if needed)
describe('Order Infrastructure Integration', () => {
  runIntegrationTestSuite('Order Stack', setupCompleteInfrastructure);
});
```

## Validation Checklist

After migration, verify:

### ✅ Layer 1 (Transport) Tests Should:

- [ ] Test connection management (connect/disconnect/reconnect)
- [ ] Test message publishing and subscription
- [ ] Test error handling for network issues
- [ ] Test optional features (buffering, ordering, etc.)
- [ ] **NOT** test event sourcing concepts
- [ ] **NOT** test business logic
- [ ] **NOT** test domain invariants

### ✅ Layer 2 (Protocol) Tests Should:

- [ ] Test command serialization/deserialization
- [ ] Test event serialization/deserialization
- [ ] Test subscription routing and filtering
- [ ] Test protocol error handling
- [ ] **NOT** test network connectivity
- [ ] **NOT** test domain invariants
- [ ] **NOT** test transport mechanics

### ✅ Layer 3 (Domain) Tests Should:

- [ ] Test optimistic concurrency control
- [ ] Test event ordering within streams
- [ ] Test aggregate consistency rules
- [ ] Test stream isolation
- [ ] Test command idempotency
- [ ] **NOT** test transport reliability
- [ ] **NOT** test protocol serialization
- [ ] **NOT** test network issues

### ✅ Layer 4 (Integration) Tests Should:

- [ ] Test complete command-to-event flows
- [ ] Test multi-step business processes
- [ ] Test performance under load
- [ ] Test failure recovery scenarios
- [ ] **NOT** duplicate individual layer tests
- [ ] **NOT** test pure transport mechanics
- [ ] **NOT** test pure domain rules in isolation

## Troubleshooting Migration Issues

### Issue: "My tests are too slow after migration"

**Solution:** You might be running too many integration tests. Move simple validation to appropriate layers (1-3).

### Issue: "Tests are failing due to missing mocks"

**Solution:** Each layer needs different mocks:

- Layer 1: Mock network infrastructure
- Layer 2: Mock transport layer
- Layer 3: Mock protocol layer
- Layer 4: Mock external systems only

### Issue: "I don't know which layer to test"

**Solution:** Ask yourself:

- Am I testing network connectivity? → Layer 1
- Am I testing message serialization? → Layer 2
- Am I testing business rules? → Layer 3
- Am I testing complete workflows? → Layer 4

### Issue: "My existing tests don't fit the new layers"

**Solution:** Your tests might be testing multiple layers. Split them:

```typescript
// Before: Mixed test
it('should process command and update database', () => {
  // Tests transport + protocol + domain + database
});

// After: Layered tests
describe('Transport Layer', () => {
  runTransportContractTests(/* transport only */);
});

describe('Domain Layer', () => {
  runDomainContractTests(/* domain only */);
});

describe('Integration', () => {
  runIntegrationTestSuite(/* end-to-end only */);
});
```

## Example: Complete Migration

Here's a complete before/after example:

### Before (Mixed concerns)

```typescript
describe('WebSocket Event Sourcing', () => {
  it('should handle complete event sourcing flow', async () => {
    // Setup (mixed concerns)
    const transport = new WebSocketTransport('ws://localhost:8080');
    const protocol = new JsonProtocol();
    const store = new PostgreSQLStore();
    const stack = new EventSourcingStack(transport, protocol, store);

    await transport.connect(); // Transport concern

    // Test (mixed concerns)
    const command = {
      /* ... */
    };
    const serialized = protocol.serialize(command); // Protocol concern
    await transport.send(serialized); // Transport concern
    const result = await store.processCommand(command); // Domain concern

    // Assertions (mixed concerns)
    expect(transport.isConnected()).toBe(true); // Transport
    expect(result.success).toBe(true); // Domain
    expect(protocol.isValid(result)).toBe(true); // Protocol
  });
});
```

### After (Layered concerns)

```typescript
describe('WebSocket Transport', () => {
  runTransportContractTests('WebSocket', () => Effect.succeed(createWebSocketTransportContext()), {
    supportsReconnection: true,
  });
});

describe('JSON Protocol', () => {
  runProtocolContractTests('JSON', () => Effect.succeed(createJsonProtocolContext()), {
    supportsCompression: false,
  });
});

describe('PostgreSQL Store', () => {
  runDomainContractTests('PostgreSQL', () => Effect.succeed(createPostgreSQLDomainContext()), {
    supportsSnapshots: true,
  });
});

describe('Complete Stack Integration', () => {
  runIntegrationTestSuite(
    'WebSocket + JSON + PostgreSQL',
    () => Effect.succeed(createCompleteStackContext()),
    { supportsHighAvailability: false }
  );
});
```

This migration provides:

- ✅ Clear separation of concerns
- ✅ Focused, maintainable tests
- ✅ No duplication between layers
- ✅ Clear guidance for implementers
- ✅ Better error messages and debugging
- ✅ Faster test execution (due to focused scope)
