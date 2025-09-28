# Transport Testing Contracts

This directory contains comprehensive testing contracts for transport layer implementations in the event sourcing framework. These contracts ensure that any transport implementation (WebSocket, HTTP, SSE, etc.) behaves correctly and consistently.

## What Are Transport Contracts?

Transport contracts are standardized test suites that verify the fundamental behaviors required by any transport implementation. They test the essential mechanics of message delivery, connection management, and resource cleanup without any event sourcing concepts.

**Think of them as the "ACID tests" for your transport layer.**

### Why Transport Contracts Exist

1. **Consistency**: Ensure all transports behave the same way from the application's perspective
2. **Reliability**: Catch transport-specific bugs before they affect your event sourcing logic
3. **Confidence**: Know that switching between transports won't break your application
4. **Documentation**: Provide clear specifications for what a transport must implement

## Contract Test Files Overview

### 1. `client-transport-contract-tests.ts` - Core Client Behaviors

Tests the fundamental client-side transport operations that every implementation must support:

- **Connection Lifecycle**: Establishing, maintaining, and cleaning up connections
- **Message Publishing**: Sending messages with various payload types and metadata
- **Message Subscription**: Receiving and filtering incoming messages
- **Connection State Monitoring**: Tracking connection state changes
- **Resource Management**: Proper cleanup when scopes close

### 2. `server-transport-contract-tests.ts` - Server-Side Behaviors

Tests server-side transport behaviors for implementations that support multiple client connections:

- **Connection Management**: Tracking multiple client connections
- **Message Broadcasting**: Sending messages to all connected clients
- **Individual Connection Communication**: Direct communication with specific clients
- **Resource Management**: Cleanup when clients disconnect or server shuts down

### 3. `client-server-contract-tests.ts` - Bidirectional Communication

Tests the interaction between client and server transport instances:

- **Connection Management**: Establishing client-server connections
- **Message Communication**: Client-to-server and server-to-client messaging
- **Connection Lifecycle**: Handling graceful disconnections and shutdowns
- **Error Handling**: Managing malformed messages and connection errors

## How to Use Transport Contracts

### Basic Client Transport Testing

For a complete example of how to implement client transport testing, see:

**WebSocket Implementation:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 36-116)
- Shows how to create test context with `WebSocketConnector.connect()`
- Demonstrates proper scope-based resource management
- Includes real error handling and random port allocation

**InMemory Implementation:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 35-126)
- Shows how to handle server instance sharing for in-memory transports
- Demonstrates direct connection patterns without network protocols

### Server Transport Testing

See the server transport implementations in the integration tests:

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

### Client-Server Integration Testing

For complete client-server integration examples, see:

**WebSocket Integration:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 38-95)
- Shows `TransportPair` implementation with random port allocation
- Demonstrates real WebSocket server/client coordination
- Includes proper error mapping and connection state management
- See line 116: `runClientServerContractTests('WebSocket', createWebSocketTestContext)`

**InMemory Integration:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 37-104)
- Shows shared server instance pattern for synchronized testing
- Demonstrates direct connection without network protocols
- See line 126: `runClientServerContractTests('InMemory', createInMemoryTestContext)`

**Transport-Specific Tests:**
Both files also include transport-specific tests (lines 122+ in WebSocket, lines 132+ in InMemory) that test implementation details beyond the standard contracts.

## Test Interface Specifications

### ConnectedTransportTestInterface

This is the core interface that client transports must implement:

```typescript
interface ConnectedTransportTestInterface {
  // Monitor connection state changes
  readonly connectionState: Stream.Stream<ConnectionState, never, never>;

  // Publish a message to the transport
  readonly publish: (message: TransportMessage) => Effect.Effect<void, TransportError, never>;

  // Subscribe to incoming messages with optional filtering
  readonly subscribe: (
    filter?: (msg: TransportMessage) => boolean
  ) => Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never>;
}
```

### TransportMessage

All messages sent through the transport must conform to this structure:

```typescript
interface TransportMessage {
  readonly id: string; // Unique message identifier
  readonly type: string; // Message type for routing/filtering
  readonly payload: unknown; // Message payload (any JSON-serializable data)
  readonly metadata?: Record<string, unknown>; // Optional metadata
}
```

### ConnectionState

Transport connections must report their state using these values:

```typescript
type ConnectionState =
  | 'connecting' // In the process of establishing connection
  | 'connected' // Successfully connected and ready
  | 'disconnecting' // In the process of closing connection
  | 'disconnected' // Connection closed
  | 'reconnecting' // Attempting to reconnect after failure
  | 'failed'; // Connection failed and won't retry
```

## Required Transport Behaviors

All transport implementations must support these core behaviors:

✅ **Connection Management**

- Establish connections using Effect's Scope pattern
- Report connection state changes via streams
- Clean up resources when scope closes

✅ **Message Publishing**

- Send messages with various payload types
- Handle messages with metadata
- Graceful error handling for invalid messages

✅ **Message Subscription**

- Receive all published messages by default
- Support optional message filtering
- Handle multiple concurrent subscriptions

✅ **Resource Cleanup**

- Automatic cleanup when Effect scopes close
- No resource leaks after disconnection
- Proper error handling during cleanup

## Common Implementation Patterns

### Scope-Based Lifecycle Management

All transport implementations use Effect's Scope pattern for resource management. See real examples:

**WebSocket Pattern:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 76-93)
- Uses `WebSocketConnector.connect(url)` which handles scope internally
- Shows error mapping and proper Effect pipeline

**InMemory Pattern:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 80-103)
- Uses server instance reference with `server.connector()`
- Demonstrates synchronized client-server lifecycle

### Connection State Streaming

Connection state is exposed as a Stream that emits current state and changes. See real implementations:

**WebSocket Implementation:**

- `/packages/eventsourcing-transport-websocket/src/lib/websocket-transport.ts` - `WebSocketConnector` class
- Connection state stream handles WebSocket lifecycle events
- Emits states: connecting → connected → disconnected/failed

**InMemory Implementation:**

- `/packages/eventsourcing-transport-inmemory/src/lib/inmemory-transport.ts` - `InMemoryTransport` class
- Immediate connection state transitions for in-memory communication
- Simplified state management without network concerns

### Message Subscription with Filtering

Subscriptions support optional filtering and multiple concurrent subscribers. See implementations:

**WebSocket Filtering:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 56-64)
- Shows subscription with filter parameter
- Tests concurrent subscriptions with different filters

**InMemory Filtering:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 65-68)
- Direct message filtering without network serialization
- Instant message delivery for testing scenarios

## Testing Best Practices

### 1. Use Unique Identifiers

Always generate unique identifiers to avoid test interference. See real examples:

**WebSocket Tests:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (line 40)
- Random port generation: `Math.floor(Math.random() * (65535 - 49152) + 49152)`
- Message IDs: `test-${Date.now()}-${Math.random()}` (line 106)

**InMemory Tests:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (line 116)
- Similar message ID pattern for deterministic testing

### 2. Proper Resource Cleanup

Effect's Scope handles cleanup automatically. See real patterns:

**WebSocket Scope Usage:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 125-151)
- All tests use `it.scoped()` for automatic cleanup
- No manual disconnect calls needed

**InMemory Scope Usage:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (lines 135-155)
- Uses `Effect.scoped` at test level
- Demonstrates proper scope nesting

### 3. Test Error Conditions

Verify graceful handling of error conditions. See real examples:

**WebSocket Error Handling:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts` (lines 154-166)
- Tests connection to non-existent port
- Uses `Effect.either` to capture connection failures

**InMemory Error Patterns:**

- In-memory transports have different error patterns since they don't use network
- Focus on testing state management and resource cleanup instead

### 4. Use Timeouts for Async Operations

Always add timeouts to prevent hanging tests. See real usage:

**WebSocket Timeouts:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts`
- Uses default timeouts from contract test utilities
- See `defaultWaitForConnectionState` and `defaultCollectMessages` (lines 101-103)

**InMemory Instant Operations:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts` (line 255)
- Very short timeouts (100ms) since operations are instant
- Demonstrates timeout adaptation based on transport characteristics

## Transport Implementation Checklist

When implementing a new transport, use this checklist to ensure compliance:

### Core Requirements

- [ ] Implements `ConnectedTransportTestInterface`
- [ ] Uses Effect Scope pattern for lifecycle management
- [ ] Exposes connection state as a Stream
- [ ] Supports message publishing with any JSON payload
- [ ] Supports message subscription with optional filtering
- [ ] Handles multiple concurrent subscriptions
- [ ] Cleans up resources when scope closes
- [ ] Passes all client transport contract tests

### Server Requirements (if applicable)

- [ ] Tracks multiple client connections
- [ ] Supports broadcasting to all clients
- [ ] Supports direct communication with individual clients
- [ ] Cleans up when clients disconnect
- [ ] Cleans up when server shuts down
- [ ] Passes all server transport contract tests

### Integration Requirements

- [ ] Supports bidirectional client-server communication
- [ ] Handles graceful disconnections
- [ ] Manages connection lifecycle properly
- [ ] Passes all client-server contract tests

## Troubleshooting Common Issues

### Connection State Not Updating

Make sure your connection state stream emits current state immediately. See working implementations:

**WebSocket State Management:**

- `/packages/eventsourcing-transport-websocket/src/lib/websocket-transport.ts`
- Proper state emission during WebSocket lifecycle events
- Handles connecting → connected → disconnecting → disconnected transitions

**InMemory State Management:**

- `/packages/eventsourcing-transport-inmemory/src/lib/inmemory-transport.ts`
- Immediate state transitions without network delays
- Simplified state management for testing scenarios

### Memory Leaks in Tests

Ensure proper cleanup via Scope. See working patterns:

**WebSocket Cleanup:**

- `/packages/eventsourcing-transport-websocket/src/tests/integration/client-server.test.ts`
- All tests use scoped pattern
- No manual `transport.disconnect()` calls needed
- Resources cleaned up automatically when scope closes

**InMemory Cleanup:**

- `/packages/eventsourcing-transport-inmemory/src/tests/integration/client-server.test.ts`
- Shared server instances cleaned up properly
- No connection leaks between test runs

### Tests Hanging on Disconnect

Ensure disconnect operations complete promptly. See working implementations:

**WebSocket Disconnect Handling:**

- `/packages/eventsourcing-transport-websocket/src/lib/websocket-transport.ts`
- Proper WebSocket close event handling
- State transitions tracked through connection lifecycle

**InMemory Disconnect Handling:**

- `/packages/eventsourcing-transport-inmemory/src/lib/inmemory-transport.ts`
- Instant disconnect since no network is involved
- Simplified for deterministic testing

## Next Steps

1. **Start with client contracts**: Implement and test the basic client transport interface
2. **Add server support**: If your transport supports servers, implement server contracts
3. **Test integration**: Verify client-server communication works correctly
4. **Consider optional features**: Evaluate which advanced features would benefit your use case
5. **Performance testing**: Use the transport contracts as a foundation for performance benchmarks

The transport contracts provide a solid foundation for building reliable, consistent transport implementations. They ensure your transport will work correctly with the event sourcing framework and can be confidently used in production applications.
