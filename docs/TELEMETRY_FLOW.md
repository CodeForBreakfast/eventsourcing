# OpenTelemetry Trace Flow

## Overview

This document describes how OpenTelemetry trace context flows through the event sourcing system, from client command through to event delivery.

## Key Principles

1. **Commands use child spans** - Command processing continues the client's trace with a child span
2. **Events use new traces** - Event delivery creates a new trace (async/decoupled from commands)
3. **Links are added programmatically** - Span links are created when reading event metadata, NOT transmitted over the wire
4. **Context is minimal** - Wire protocol only carries `{traceId, parentId}`, no links

## The Flow

### 1. Client Context Origin

The client has an active OpenTelemetry span from the operation that triggered the command (e.g., user interaction, API call).

**Client span:** `{traceId: 'A', spanId: '1'}`

### 2. Client → Server (ProtocolCommand)

The client propagates its current span context in the command message.

**Wire format:**

```typescript
{
  type: 'command',
  id: 'cmd-123',
  target: 'user-456',
  name: 'UpdateProfile',
  payload: {...},
  context: {
    traceId: 'A',    // Client's trace ID
    parentId: '1'    // Client's span ID
  }
}
```

### 3. Server Processing Context

Server extracts the context and creates a **child span** for command processing:

- Same `traceId: 'A'` (continues client's trace)
- New `spanId: '2'` (server's processing span)
- Parent span ID is `'1'` (client's span)

```typescript
// Server creates span from context
const span = tracer.startSpan('process_command', {
  parent: extractedContext, // {traceId: 'A', spanId: '1'}
  // This creates spanId: '2' as child of '1'
});
```

### 4. Event Persistence

When the command succeeds and creates an event, persist the **command's origin** (context + actor) in event metadata:

```typescript
Event {
  streamId: 'user-456',
  position: {...},
  type: 'ProfileUpdated',
  data: {...},
  metadata: {
    occurredAt: '2025-10-06T...',
    origin: {
      context: {
        traceId: 'A',    // Command's trace ID
        parentId: '2'    // Command's span ID
      },
      actor: 'user-789'  // Who initiated the command (was "originator")
    }
  }
}
```

**NOT stored in metadata:** Links - these will be added programmatically when reading

**Note:** `originator` is being renamed to `origin.actor` to better reflect that origin includes both WHO (actor) and WHERE (context).

### 5. Server Notification Context (from Store)

When the store notifies the server about a new event, the server creates a **NEW trace** for the event delivery flow (async/decoupled):

```typescript
// Server creates NEW span for event delivery
const eventSpan = tracer.startSpan('deliver_event', {
  // No parent - this is a new trace
  // Creates: {traceId: 'B', spanId: '3'}
});

// Add link to command that caused this event (from event metadata)
eventSpan.addLink({
  traceId: event.metadata.origin.context.traceId, // 'A'
  spanId: event.metadata.origin.context.parentId, // '2'
});
```

### 6. Server → Client (ProtocolEvent)

Send the event with the **new delivery context** (no links transmitted):

```typescript
{
  type: 'event',
  streamId: 'user-456',
  position: {...},
  eventType: 'ProfileUpdated',
  data: {...},
  timestamp: '2025-10-06T...',
  context: {
    traceId: 'B',    // NEW trace for event delivery
    parentId: '3'    // Server's event delivery span
  }
  // NO links - they're added to the span when creating it
}
```

### 7. Client Event Processing Context

Client receives the event and creates a **child span** of the delivery context:

```typescript
// Client creates span from delivered context
const span = tracer.startSpan('process_event', {
  parent: { traceId: 'B', spanId: '3' },
  // This creates spanId: '4' as child of '3'
});

// Client can see via observability backend that trace B
// has a link to trace A (added server-side in step 5)
```

## Command Response Flow

For synchronous command responses:

**Server → Client (ProtocolCommandResult):**

```typescript
{
  type: 'command_result',
  commandId: 'cmd-123',
  success: true,
  position: {...},
  context: {
    traceId: 'A',    // Same trace as command
    parentId: '2'    // Server's processing span
  }
}
```

Client receives response and correlates it back to the original command request using the context.

## Wire Protocol Summary

### Messages that include context:

- ✅ `ProtocolCommand` - includes `context: {traceId, parentId}`
- ✅ `ProtocolCommandResult` - includes `context: {traceId, parentId}`
- ✅ `ProtocolSubscribe` - includes `context: {traceId, parentId}`
- ✅ `ProtocolEvent` - includes `context: {traceId, parentId}`

### What's NOT in wire protocol:

- ❌ Span links - added programmatically from event metadata
- ❌ Trace flags - handled by OpenTelemetry SDK
- ❌ Trace state - handled by OpenTelemetry SDK

## Event Metadata

Events must store command origin (context + actor) for linking and auditing:

```typescript
interface EventMetadata {
  occurredAt: Date;
  origin: {
    context: {
      traceId: string; // 32-char hex (128-bit)
      parentId: string; // 16-char hex (64-bit)
    };
    actor: string; // Who initiated the command (was "originator")
  };
}
```

### Schema Changes Required

**Current schema (eventsourcing-aggregates):**

```typescript
const EventMetadata = Schema.Struct({
  occurredAt: Schema.ValidDateFromSelf,
  originator: originatorSchema,
});
```

**New schema:**

```typescript
const TraceContext = Schema.Struct({
  traceId: Schema.String, // 32-char hex
  parentId: Schema.String, // 16-char hex
});

const EventOrigin = <TActor>(actorSchema: Schema.Schema<TActor>) =>
  Schema.Struct({
    context: TraceContext,
    actor: actorSchema,
  });

const EventMetadata = <TActor>(actorSchema: Schema.Schema<TActor>) =>
  Schema.Struct({
    occurredAt: Schema.ValidDateFromSelf,
    origin: EventOrigin(actorSchema),
  });
```

## Trace Relationships

```
Client Trace A:
  Span 1 (client action)
    └─ Span 2 (server command processing)

Event Delivery Trace B:
  Span 3 (server event delivery) [LINKED to A:2]
    └─ Span 4 (client event processing)
```

The link between traces allows observability tools to show that Event B was caused by Command A, even though they're in separate traces.

## Testing Strategy

### Layer 1: Protocol Schema Tests (Unit)

**Location**: `packages/eventsourcing-protocol/src/lib/protocol.test.ts`

Test that all wire protocol message schemas include the context field:

- `ProtocolCommand` has `context: {traceId, parentId}`
- `ProtocolSubscribe` has `context: {traceId, parentId}`
- `ProtocolCommandResult` has `context: {traceId, parentId}`
- `ProtocolEvent` has `context: {traceId, parentId}`

These tests verify the schema definitions only - they check that messages serialized to JSON contain the correct structure.

### Layer 2: Protocol Integration Tests

**Location**: `packages/eventsourcing-protocol/src/lib/protocol.test.ts` - "Server Protocol Integration" suite

Test the complete trace flow through the protocol layer:

1. **Client sends command with trace context**
   - Client has active span (traceId: A, spanId: 1)
   - ProtocolCommand contains `context: {traceId: 'A', parentId: '1'}`
   - Server receives and can extract context

2. **Server processes command as child span**
   - Server extracts context from ProtocolCommand
   - Server creates child span (traceId: A, spanId: 2, parent: 1)
   - Command processing happens within this span

3. **Command result maintains trace**
   - ProtocolCommandResult contains `context: {traceId: 'A', parentId: '2'}`
   - Client receives result and can correlate back to original command

4. **Event delivery uses new trace with link**
   - Server reads event with metadata `origin: {context: {traceId: 'A', parentId: '2'}, actor}`
   - Server creates NEW span (traceId: B, spanId: 3)
   - Server adds link to original command span (A:2)
   - ProtocolEvent contains `context: {traceId: 'B', parentId: '3'}`
   - Link is NOT in wire protocol - added programmatically

5. **Client processes event with new trace**
   - Client extracts context from ProtocolEvent
   - Client creates child span (traceId: B, spanId: 4, parent: 3)
   - Event handler runs within this span

### Layer 3: Aggregate/Event Store Tests

**Location**: `packages/eventsourcing-aggregates/src/lib/aggregateRootEventStream.test.ts`

Test that event metadata correctly captures command origin:

1. **Event metadata includes origin**
   - `eventMetadata()` captures both trace context and actor
   - Schema: `origin: {context: {traceId, parentId}, actor}`

2. **Context flows from command to event**
   - Command executed with trace context (A:2)
   - Resulting event has `origin.context: {traceId: 'A', parentId: '2'}`
   - Actor (originator) preserved as `origin.actor`

### Layer 4: Transport Contract Tests (Optional)

**Location**: `packages/eventsourcing-testing-contracts/src/lib/transport/client-server-contract-tests.ts`

The transport layer is context-agnostic - it just carries messages. The existing transport tests verify that message payloads are transmitted correctly, which is sufficient. We don't need specific telemetry tests at this layer since the transport treats all payloads as opaque strings.

### Test Implementation Order

1. **Start with Protocol Schema tests** - Define the wire format structure
2. **Add Aggregate metadata tests** - Verify event metadata schema changes
3. **Implement Protocol Integration tests** - Verify end-to-end trace flow
4. **Transport tests** - No changes needed (already generic)

### What NOT to Test

- OpenTelemetry SDK internals (span creation, propagation) - trust the SDK
- Trace context serialization format - trust W3C spec compliance
- Observability backend behavior - out of scope
