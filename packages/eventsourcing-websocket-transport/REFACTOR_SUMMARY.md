# Transport Refactor Summary

## Objective: Make Invalid States Unrepresentable

Successfully refactored the WebSocket transport to use a functional design that makes it impossible to call transport methods before connecting.

## Key Changes

### 1. New Type Structure

**Before:**

```typescript
interface EventTransport<TEvent> {
  readonly subscribe: (position: EventStreamPosition) => Effect<...>
  readonly sendCommand: <TPayload>(command: AggregateCommand<TPayload>) => Effect<...>
  readonly disconnect: () => Effect<void>
}

// ❌ Could be used before connection established
const transport = makeEventTransport(url, schema);
transport.subscribe(position); // Might fail silently
```

**After:**

```typescript
interface ConnectedTransport<TEvent> {
  readonly subscribe: (position: EventStreamPosition) => Effect<...>
  readonly sendCommand: <TPayload>(command: AggregateCommand<TPayload>) => Effect<...>
  readonly disconnect: () => Effect<void>
}

// ✅ Can ONLY be obtained after successful connection
const connect = (url: string, schema: Schema<TEvent>) =>
  Effect<ConnectedTransport<TEvent>, WebSocketError, Scope>
```

### 2. Functional API

**Primary API:**

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket-transport';

const program = pipe(
  connect('ws://localhost:8080', MyEventSchema),
  Effect.flatMap((connectedTransport) =>
    // Only here can you use the transport methods
    connectedTransport.subscribe(position)
  ),
  Effect.scoped // Automatic cleanup
);
```

### 3. Service Layer Options

**Connector Service (Recommended for Production):**

```typescript
export class EventTransportConnector extends Effect.Tag('<EventTransportConnector')<
  EventTransportConnector,
  { connect: (url: string) => Effect<ConnectedTransport<unknown>, WebSocketError, Scope> }
>() {}
```

**Legacy Service (For Testing/Backward Compatibility):**

```typescript
export class EventTransportService extends Effect.Tag('<EventTransport')<
  EventTransportService,
  ConnectedTransport<unknown>
>() {}
```

### 4. Layer Implementations

```typescript
// Functional connector - clients must call connect()
export const EventTransportConnectorLive = (eventSchema: Schema<unknown>) =>
  Layer.succeed(EventTransportConnector, {
    connect: (url: string) => createConnectedTransport(url, eventSchema),
  });

// Pre-connected transport - for testing
export const EventTransportLive = (url: string, eventSchema: Schema<unknown>) =>
  Layer.scoped(EventTransportService, createConnectedTransport(url, eventSchema));
```

## Benefits Achieved

### 1. **Type Safety**

- **Impossible** to call `subscribe` or `sendCommand` without a `ConnectedTransport`
- TypeScript compiler enforces correct usage at compile time
- No runtime errors from calling methods on unconnected transports

### 2. **Clear State Management**

- Connection state is encoded in the types
- `ConnectedTransport` can ONLY exist after successful connection
- No ambiguity about transport readiness

### 3. **Proper Error Handling**

- Connection errors happen at connection time, not method call time
- Methods on `ConnectedTransport` can focus on business logic
- Clear separation of connection vs. operation errors

### 4. **Resource Safety**

- Scoped effects ensure proper cleanup
- No leaked connections or resources
- Automatic resource management with Effect.scoped

## Migration Guide

**Old Pattern:**

```typescript
const transport = await makeEventTransport(url, schema);
await transport.subscribe(position);
```

**New Functional Pattern:**

```typescript
const program = pipe(
  connect(url, schema),
  Effect.flatMap((transport) => transport.subscribe(position)),
  Effect.scoped
);
await Effect.runPromise(program);
```

**Service Pattern (for testing):**

```typescript
// Keeps working with minimal changes
const transport = EventTransportService;
transport.subscribe(position); // Still works
```

## Files Modified

- `/src/lib/event-transport.ts` - Core refactor
- `/src/lib/testing/transport-test-suite.ts` - Import adjustments
- Added demonstration files:
  - `/examples/invalid-states-demo.ts`
  - `/FUNCTIONAL_DESIGN_EXAMPLE.md`

## Backward Compatibility

- Legacy `EventTransportService` maintained for existing tests
- Both functional and service patterns supported
- Gradual migration path available

The refactor successfully makes invalid states unrepresentable while maintaining a clear upgrade path!
