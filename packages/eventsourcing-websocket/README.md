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
import { Effect, Stream, pipe } from 'effect';

const sendCommand = (command: WireCommand) =>
  pipe(
    sendWireCommand(command),
    Effect.flatMap(() => subscribe('user-123')),
    Effect.flatMap((events) =>
      Stream.runForEach(events, (event) => Effect.sync(() => console.log('Event:', event.type)))
    )
  );

const myApplication = sendCommand({
  id: crypto.randomUUID(),
  target: 'user-123',
  name: 'CreateUser',
  payload: { name: 'Alice', email: 'alice@example.com' },
});

const layer = makeWebSocketProtocolLayer('ws://localhost:8080');

await Effect.runPromise(pipe(myApplication, Effect.provide(layer), Effect.scoped));
```

To switch transports (e.g., to HTTP), you'd only change the layer - application code stays the same.

### Convenience: Direct Connection

For quick prototypes or scripts, you can use the makeWebSocketProtocolLayer directly with Effect.scoped:

```typescript
import { makeWebSocketProtocolLayer } from '@codeforbreakfast/eventsourcing-websocket';
import { sendWireCommand } from '@codeforbreakfast/eventsourcing-protocol';
import { Effect, pipe } from 'effect';

const sendCommand = pipe(
  sendWireCommand({
    id: crypto.randomUUID(),
    target: 'user-123',
    name: 'CreateUser',
    payload: { name: 'Alice' },
  }),
  Effect.provide(makeWebSocketProtocolLayer('ws://localhost:8080')),
  Effect.scoped
);

Effect.runPromise(sendCommand);
```

**Note**: The layer-based approach is preferred for production applications as it supports dependency injection and testing.

## API Reference

### `makeWebSocketProtocolLayer`

```typescript
import { Layer, Scope } from 'effect';
import { Protocol } from '@codeforbreakfast/eventsourcing-protocol';
import { TransportError, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';

declare const makeWebSocketProtocolLayer: (
  url: string
) => Layer.Layer<Protocol, TransportError | ConnectionError, Scope.Scope>;
```

Creates an Effect Layer that provides the Protocol service over WebSocket.

**Parameters:**

- `url: string` - WebSocket server URL (e.g., `ws://localhost:8080`)

**Returns:** Layer that can be provided to your application

**Example:**

```typescript
import { Effect, pipe } from 'effect';
import { makeWebSocketProtocolLayer } from '@codeforbreakfast/eventsourcing-websocket';

declare const myApp: Effect.Effect<void, never, never>;

const runApp = pipe(
  myApp,
  Effect.provide(makeWebSocketProtocolLayer('ws://localhost:8080')),
  Effect.scoped
);

Effect.runPromise(runApp);
```

### `connect`

```typescript
import { Effect, Scope } from 'effect';
import { Protocol } from '@codeforbreakfast/eventsourcing-protocol';
import { TransportError, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';

declare const connect: (
  url: string
) => Effect.Effect<Protocol, TransportError | ConnectionError, Protocol | Scope.Scope>;
```

Convenience function that connects and returns the Protocol service directly.

**Parameters:**

- `url: string` - WebSocket server URL

**Returns:** Effect providing Protocol service (must be run in scoped context)

**Example:**

```typescript
import { Effect, pipe } from 'effect';
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const program = pipe(
  connect('ws://localhost:8080'),
  Effect.flatMap((protocol) => Effect.succeed(protocol)), // use protocol...
  Effect.scoped
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
