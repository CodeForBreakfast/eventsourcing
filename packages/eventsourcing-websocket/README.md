# @codeforbreakfast/eventsourcing-websocket

**WebSocket integration package** - Combines WebSocket transport with event sourcing protocols (coming soon).

> ⚠️ **Note**: This package will provide a batteries-included WebSocket event sourcing solution once the protocol layer is implemented. For now, use the transport package directly.

## Current Status

This package is under development. It will combine:

- ✅ **WebSocket Transport** (`@codeforbreakfast/eventsourcing-transport-websocket`) - COMPLETED
- 🚧 **Protocol Layer** (`@codeforbreakfast/eventsourcing-protocol-default`) - IN PROGRESS
- 🔜 **Convenience API** - PLANNED

## Available Now

While the convenience package is being developed, you can use the WebSocket transport directly:

```bash
bun add @codeforbreakfast/eventsourcing-transport-websocket
```

```typescript
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { Effect, Stream, pipe } from 'effect';

const program = Effect.scoped(
  Effect.gen(function* () {
    // Connect to WebSocket server
    const transport = yield* WebSocketConnector.connect('ws://localhost:8080');

    // Use the transport for messaging
    yield* transport.publish({
      id: makeMessageId('msg-1'),
      type: 'my.message',
      payload: { data: 'Hello!' },
    });
  })
);
```

See the [WebSocket Transport README](../eventsourcing-transport-websocket/README.md) for complete documentation.

## Coming Soon

Once the protocol layer is complete, this package will provide:

- **One-line setup** for event sourcing over WebSocket
- **Pre-configured stack** with transport and protocol layers
- **Sensible defaults** for production use
- **Full customization** when needed
- **Migration helpers** from separate packages

## Roadmap

1. ✅ **Phase 1**: WebSocket Transport (COMPLETED)
   - Client connector implementation
   - Server acceptor implementation
   - Connection management
   - Message delivery

2. 🚧 **Phase 2**: Protocol Layer (IN PROGRESS)
   - Command handling
   - Event streaming
   - Aggregate management
   - Optimistic concurrency

3. 🔜 **Phase 3**: Convenience Package
   - Simplified API
   - Default configurations
   - Migration helpers
   - Documentation

## Contributing

This package is part of the `@codeforbreakfast/eventsourcing` monorepo. See the main repository for contribution guidelines.

## License

MIT
