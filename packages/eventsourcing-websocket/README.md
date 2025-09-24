# @codeforbreakfast/eventsourcing-websocket

**WebSocket integration package** - Combines WebSocket transport with event sourcing protocols for rapid development.

## Features

- ✅ **WebSocket Transport** - Full client and server WebSocket implementation
- ✅ **Protocol Layer** - Command/event protocol with optimistic concurrency
- ✅ **Convenience API** - One-line setup for event sourcing over WebSocket

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-websocket
```

## Quick Start

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';
import { Effect, pipe } from 'effect';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Connect with batteries-included protocol
    const protocol = yield* connect('ws://localhost:8080');

    // Send commands and receive events seamlessly
    const result = yield* protocol.sendCommand({
      id: 'cmd-1',
      target: 'user:123',
      type: 'user.register',
      payload: { email: 'user@example.com' },
    });

    // Subscribe to events
    const events = yield* protocol.subscribeToEvents('user:123');
  })
);
```

## Advanced Usage

### Custom Configuration

```typescript
import { connect, makeWebSocketProtocolLayer } from '@codeforbreakfast/eventsourcing-websocket';
import { Layer, Effect } from 'effect';

// Create a custom layer for dependency injection
const customLayer = makeWebSocketProtocolLayer('ws://localhost:8080');

const program = Effect.gen(function* () {
  const protocol = yield* Protocol;
  // Use protocol...
}).pipe(Effect.provide(customLayer));
```

### Server-side Usage

For server implementations, use the transport package directly:

```bash
bun add @codeforbreakfast/eventsourcing-transport-websocket
```

See the [WebSocket Transport README](../eventsourcing-transport-websocket/README.md) for server setup.

## Contributing

This package is part of the `@codeforbreakfast/eventsourcing` monorepo. See the main repository for contribution guidelines.

## License

MIT
