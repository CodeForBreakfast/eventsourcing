# @codeforbreakfast/eventsourcing-websocket

**WebSocket transport layer setup** for event sourcing clients.

## Purpose

This package provides the WebSocket transport implementation for connecting to event sourcing servers. **Use this package ONLY for creating your Effect Layer** - all application logic should use `@codeforbreakfast/eventsourcing-protocol`.

**Key principle**: Your application code shouldn't know it's using WebSocket. This is a deployment detail configured once when setting up layers.

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-websocket
bun add @codeforbreakfast/eventsourcing-protocol
bun add @codeforbreakfast/eventsourcing-commands
```

## Layer Setup

### Recommended: Layer-based Setup

```typescript
import { makeWebSocketProtocolLayer } from '@codeforbreakfast/eventsourcing-websocket';
import { sendWireCommand, subscribe } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
import { Effect, Stream } from 'effect';

// ============================================================================
// Application Code (transport-agnostic)
// ============================================================================

const myApplication = Effect.gen(function* () {
  // Your code uses protocol abstractions - doesn't know about WebSocket
  const command: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-123',
    name: 'CreateUser',
    payload: { name: 'Alice', email: 'alice@example.com' },
  };

  const result = yield* sendWireCommand(command);

  const events = yield* subscribe('user-123');
  yield* Stream.runForEach(events, (event) => Effect.sync(() => console.log('Event:', event.type)));
});

// ============================================================================
// Layer Setup (WebSocket-specific - ONE PLACE ONLY)
// ============================================================================

const layer = makeWebSocketProtocolLayer('ws://localhost:8080');

// Run application with WebSocket transport
await Effect.runPromise(myApplication.pipe(Effect.provide(layer)));
```

To switch transports (e.g., to HTTP), you'd only change the layer - application code stays the same.

### Convenience: Direct Connection

For quick prototypes or scripts:

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';
import { Effect } from 'effect';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Returns Protocol service directly
    const protocol = yield* connect('ws://localhost:8080');

    const result = yield* protocol.sendWireCommand({
      id: crypto.randomUUID(),
      target: 'user-123',
      name: 'CreateUser',
      payload: { name: 'Alice' },
    });
  })
);

await Effect.runPromise(program);
```

**Note**: The layer-based approach is preferred for production applications as it supports dependency injection and testing.

## API Reference

### `makeWebSocketProtocolLayer`

```typescript
const makeWebSocketProtocolLayer: (
  url: string
) => Layer<Protocol, TransportError | ConnectionError, Scope>;
```

Creates an Effect Layer that provides the Protocol service over WebSocket.

**Parameters:**

- `url: string` - WebSocket server URL (e.g., `ws://localhost:8080`)

**Returns:** Layer that can be provided to your application

**Example:**

```typescript
const layer = makeWebSocketProtocolLayer('ws://localhost:8080');
Effect.runPromise(myApp.pipe(Effect.provide(layer)));
```

### `connect`

```typescript
const connect: (
  url: string
) => Effect<Protocol, TransportError | ConnectionError, Protocol | Scope>;
```

Convenience function that connects and returns the Protocol service directly.

**Parameters:**

- `url: string` - WebSocket server URL

**Returns:** Effect providing Protocol service (must be run in scoped context)

**Example:**

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const protocol = yield* connect('ws://localhost:8080');
    // use protocol...
  })
);
```

## Next Steps

Once you've set up your WebSocket layer, see the following packages for building your application:

- **[@codeforbreakfast/eventsourcing-protocol](../eventsourcing-protocol)** - Send commands and subscribe to events (your main application API)
- **[@codeforbreakfast/eventsourcing-commands](../eventsourcing-commands)** - WireCommand and CommandResult types
- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Event types and event store contracts

## Advanced: Low-Level Transport

If you need access to the raw WebSocket transport (for advanced use cases), see:

- **[@codeforbreakfast/eventsourcing-transport-websocket](../eventsourcing-transport-websocket)** - Low-level WebSocket transport implementation

## Contributing

This package is part of the `@codeforbreakfast/eventsourcing` monorepo. See the main repository for contribution guidelines.

## License

MIT
