# Transport Abstraction Roadmap

## Overview

This document outlines the remaining work to make the event sourcing protocol transport-agnostic, allowing it to work over WebSocket, HTTP, SSE, and other transports.

## Current State

### ✅ What's Complete

1. **Transport Abstractions Package** (`packages/eventsourcing-transport/`)
   - `ConnectedTransport` - High-level transport interface
   - `ConnectedRawTransport<TWireFormat>` - Low-level wire transport
   - `ConnectedSchemaTransport` - Schema-aware with codecs
   - Connection-gated pattern with Effect.acquireRelease
   - Example implementations (in-memory, basic WebSocket)

2. **Design Decisions**
   - Types only define outputs, not inputs (implementations curry config)
   - Connection established before any operations are available
   - Automatic cleanup with Effect.scoped

### 🚧 What's Not Complete

The WebSocket transport (`packages/eventsourcing-websocket-transport/`) still directly uses WebSocket APIs instead of our abstractions. It has two layers that need separation:

1. **Raw Transport Layer** - WebSocket connection management (should use our abstraction)
2. **Event Sourcing Protocol Layer** - Subscriptions, commands, aggregates (should be transport-agnostic)

## Implementation Plan

### Phase 1: Extract Event Sourcing Protocol (Priority: High)

**Goal:** Create a transport-agnostic event sourcing protocol that can work with any `ConnectedRawTransport`.

#### Task 1.1: Analyze Current Implementation

- [ ] Study `packages/eventsourcing-websocket-transport/src/lib/event-transport/`
- [ ] Document protocol message types and flows
- [ ] Identify transport-specific vs protocol-specific code

**Key Files to Review:**

- `event-transport/implementation.ts` - Main protocol logic
- `event-transport/types.ts` - Protocol message definitions
- `webSocketConnection.ts` - WebSocket-specific layer

#### Task 1.2: Design Protocol Abstraction

- [ ] Create `EventSourcingProtocol` interface that consumes `ConnectedRawTransport`
- [ ] Define protocol state machine independent of transport
- [ ] Plan migration path that doesn't break existing code

**Interface Sketch:**

```typescript
interface EventSourcingProtocol<TEvent> {
  // Takes any raw transport, returns event sourcing capabilities
  create: (
    transport: ConnectedRawTransport<string>
  ) => Effect.Effect<EventSourcingTransport<TEvent>, ProtocolError>;
}
```

### Phase 2: Refactor WebSocket Transport (Priority: High)

**Goal:** Make the existing WebSocket transport use our abstractions without breaking changes.

#### Task 2.1: Implement ConnectedRawTransport for WebSocket

- [ ] Create `WebSocketRawTransport` implementing `ConnectedRawTransport<string>`
- [ ] Handle WebSocket-specific features (ping/pong, connection states)
- [ ] Ensure proper error mapping and connection lifecycle

**Implementation Location:**

- Create new file: `packages/eventsourcing-websocket-transport/src/lib/raw-transport.ts`
- Keep existing `webSocketConnection.ts` during transition

#### Task 2.2: Migrate Protocol to Use Abstraction

- [ ] Update event transport to use `ConnectedRawTransport` instead of direct WebSocket
- [ ] Ensure all existing tests pass
- [ ] Maintain backward compatibility of public API

**Testing Strategy:**

- Keep all existing tests
- Add abstraction layer tests
- Ensure no performance regression

### Phase 3: Alternative Transport Implementations (Priority: Medium)

**Goal:** Prove the abstraction works with different transport mechanisms.

#### Task 3.1: HTTP Long-Polling Transport

- [ ] Implement `ConnectedRawTransport<string>` using fetch API
- [ ] Handle request/response correlation
- [ ] Manage polling intervals and backoff
- [ ] Deal with connection state over stateless HTTP

**Design Considerations:**

- Use POST for client→server, GET with long timeout for server→client
- Correlation IDs for request/response matching
- Session management for connection state

#### Task 3.2: Server-Sent Events (SSE) Transport

- [ ] Implement `ConnectedRawTransport<string>` using EventSource
- [ ] Handle unidirectional nature (server→client only)
- [ ] Combine with HTTP POST for client→server messages
- [ ] Manage reconnection and event ID tracking

**Design Considerations:**

- EventSource for server→client streaming
- Separate HTTP endpoint for client→server
- Message correlation between two channels

### Phase 4: Integration & Documentation (Priority: Low)

#### Task 4.1: Integration Testing

- [ ] Create test suite that runs against all transports
- [ ] Verify protocol behavior consistency
- [ ] Performance benchmarks for each transport
- [ ] Fallback scenarios (WebSocket → SSE → HTTP)

#### Task 4.2: Documentation

- [ ] Transport selection guide (when to use which)
- [ ] Configuration examples for each transport
- [ ] Migration guide from direct WebSocket usage
- [ ] Performance characteristics comparison

## Technical Details

### Protocol Messages (Current)

The event sourcing protocol currently uses these message types:

```typescript
// Client → Server
type ClientMessage =
  | { type: 'subscribe'; streamId: string; position?: number }
  | { type: 'unsubscribe'; streamId: string }
  | { type: 'command'; aggregateId: string; command: any };

// Server → Client
type ServerMessage =
  | { type: 'subscribed'; streamId: string }
  | { type: 'unsubscribed'; streamId: string }
  | { type: 'event'; streamId: string; event: any; position: number }
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'commandResult'; correlationId: string; result: any };
```

### Required Transport Capabilities

For a transport to support the event sourcing protocol, it must:

1. **Bidirectional Communication** - Send and receive messages
2. **Message Ordering** - Preserve order within a stream
3. **Connection State** - Track connected/disconnected
4. **Error Handling** - Distinguish transient vs permanent failures
5. **Cleanup** - Proper resource disposal on disconnect

### Success Criteria

- [ ] WebSocket transport continues working identically
- [ ] At least one alternative transport fully functional
- [ ] Clean separation: transport layer ↔ protocol layer
- [ ] No performance degradation
- [ ] Comprehensive test coverage

## Getting Started for New Contributors

1. **Understand the Current Code:**
   - Read through the WebSocket transport implementation
   - Understand the event sourcing protocol flow
   - Review the transport abstractions we've created

2. **Start Small:**
   - Begin with Phase 1.1 (analysis and documentation)
   - Create proof-of-concept before full implementation
   - Get feedback early on design decisions

3. **Maintain Compatibility:**
   - Don't break existing WebSocket transport users
   - Keep public APIs stable
   - Add deprecation notices if changes needed

4. **Test Thoroughly:**
   - Unit tests for each layer
   - Integration tests for protocol + transport
   - Performance benchmarks

## Questions & Discussion

For questions or design discussions, please open an issue with the `transport-abstraction` label.

Key design decisions should be documented in ADRs (Architecture Decision Records) in the `/docs/adr/` directory.
