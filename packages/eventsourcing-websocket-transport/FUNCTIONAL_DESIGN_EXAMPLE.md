# Functional Transport Design Example

This document demonstrates the new functional design that makes invalid states unrepresentable.

## The Problem with the Old Design

```typescript
// OLD DESIGN - Can call methods before connection!
const transport = await makeEventTransport(url, schema); // Returns EventTransport
transport.subscribe(position); // ❌ Might fail if not connected
transport.sendCommand(command); // ❌ Might fail if not connected
```

## The New Functional Design

```typescript
import { connect, Schema } from '@codeforbreakfast/eventsourcing-websocket-transport';
import { pipe, Effect, Stream } from 'effect';

// Define your event schema
const UserEvent = Schema.Struct({
  type: Schema.Literal('UserRegistered'),
  userId: Schema.String,
  email: Schema.String,
});

// FUNCTIONAL APPROACH - Must connect first!
const program = pipe(
  // 1. Connect returns ConnectedTransport only on success
  connect('ws://localhost:8080', UserEvent),

  // 2. Only ConnectedTransport has subscribe/sendCommand methods
  Effect.flatMap((connectedTransport) =>
    pipe(
      // Now we can safely use the transport
      connectedTransport.subscribe({
        streamId: 'user-123',
        eventNumber: 0,
      }),

      Effect.flatMap((eventStream) => pipe(eventStream, Stream.take(10), Stream.runCollect)),

      // Clean up the connection
      Effect.ensuring(connectedTransport.disconnect())
    )
  ),

  // Handle connection errors properly
  Effect.catchTag('WebSocketError', (error) =>
    Effect.logError(`Failed to connect: ${error.message}`)
  ),

  // Automatic cleanup with scoped
  Effect.scoped
);

// Run the program
Effect.runPromise(program);
```

## Key Benefits

1. **Type Safety**: You cannot call `subscribe` or `sendCommand` without a `ConnectedTransport`
2. **Clear State**: The types tell you exactly what state you're in
3. **Proper Error Handling**: Connection errors are handled at the connection level
4. **Resource Safety**: Scoped effects ensure proper cleanup

## Using with Services

```typescript
// For dependency injection
const ConnectorLayer = EventTransportConnectorLive(UserEvent);

const useTransport = pipe(
  EventTransportConnector,
  Effect.flatMap((connector) => connector.connect('ws://localhost:8080')),
  Effect.flatMap((transport) =>
    // Use the connected transport
    transport.subscribe(position)
  ),
  Effect.provide(ConnectorLayer),
  Effect.scoped
);
```

## Migration from Old API

**Before:**

```typescript
const transport = makeEventTransport(url, schema); // Could fail silently
transport.subscribe(position); // Might not be connected
```

**After:**

```typescript
const connectedTransport = connect(url, schema); // Explicit connection
connectedTransport.subscribe(position); // Guaranteed to be connected
```

The new design makes it impossible to use the transport incorrectly!
