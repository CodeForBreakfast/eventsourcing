# @codeforbreakfast/eventsourcing-websocket

**Batteries-included WebSocket event sourcing package** - Complete WebSocket transport with default protocol for rapid event sourcing development.

This package combines the `@codeforbreakfast/eventsourcing-transport-websocket` and `@codeforbreakfast/eventsourcing-protocol-default` packages into a single, easy-to-use API that gets you up and running with event sourcing over WebSocket in seconds.

## 🚀 Quick Start

```bash
bun add @codeforbreakfast/eventsourcing-websocket effect
```

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  // One line to connect and start using event sourcing
  const protocol = yield* connect('ws://localhost:8080');

  // Subscribe to events
  const events = yield* protocol.subscribe({
    streamId: 'user-stream',
    eventNumber: 0,
  });

  // Send commands
  const result = yield* protocol.sendCommand({
    aggregate: {
      position: { streamId: 'user-123', eventNumber: 0 },
      name: 'User',
    },
    commandName: 'CreateUser',
    payload: { name: 'John Doe', email: 'john@example.com' },
  });

  return { events, result };
});

// Run the program
Effect.runPromise(Effect.scoped(program));
```

## 🎯 Key Features

- **One-line setup** - Get started with WebSocket event sourcing instantly
- **Pre-configured stack** - Transport and protocol layers work together out of the box
- **Sensible defaults** - Production-ready configuration without the complexity
- **Full customization** - Access to all underlying APIs when you need them
- **Migration helpers** - Easy upgrade path from separate packages
- **Type-safe** - Complete TypeScript support with Effect integration
- **Battle-tested** - Built on proven transport and protocol implementations

## 📚 Usage Examples

### Basic Connection

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield * connect('ws://localhost:8080');
```

### With Custom Configuration

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol =
  yield *
  connect('ws://localhost:8080', {
    config: {
      defaultTimeout: 60000,
      maxConcurrentCommands: 50,
      reconnectAttempts: 5,
      reconnectDelayMs: 2000,
    },
  });
```

### With Custom Context

```typescript
import { connect, createBasicProtocolContext } from '@codeforbreakfast/eventsourcing-websocket';

const context = createBasicProtocolContext({
  sessionId: 'my-session-id',
  userId: 'user-123',
  tenantId: 'tenant-456',
});

const protocol = yield * connect('ws://localhost:8080', { context });
```

### Using Effect Layers (Advanced)

```typescript
import { createWebSocketProtocolStack } from '@codeforbreakfast/eventsourcing-websocket';
import { DefaultProtocolConnectorService } from '@codeforbreakfast/eventsourcing-websocket';

const WebSocketLayer = createWebSocketProtocolStack();

const program = Effect.gen(function* () {
  const connector = yield* DefaultProtocolConnectorService;
  const protocol = yield* connector.connect('ws://localhost:8080');

  // Use protocol...
}).pipe(Effect.provide(WebSocketLayer));
```

## 🔄 Migration Guide

### From Separate Packages

If you're currently using the transport and protocol packages separately:

**Before:**

```typescript
// Multiple imports and manual setup
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-protocol-default';

const connector = new WebSocketConnector();
const protocol = yield * connectWithCompleteStack(connector, 'ws://localhost:8080');
```

**After:**

```typescript
// Single import and one-line setup
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield * connect('ws://localhost:8080');
```

### Gradual Migration Strategy

1. **Step 1: Change Import Only**

   ```typescript
   // Change this import
   import { connectWebSocket } from '@codeforbreakfast/eventsourcing-websocket';

   // Keep your existing code
   const protocol = yield * connectWebSocket('ws://localhost:8080');
   ```

2. **Step 2: Update Function Name**

   ```typescript
   // Now update to the new function name
   import { connect } from '@codeforbreakfast/eventsourcing-websocket';

   const protocol = yield * connect('ws://localhost:8080');
   ```

### From Legacy WebSocket Packages

**Before:**

```typescript
import { connectWebSocketEventSourcing } from '@old/websocket-eventsourcing';

const client = yield * connectWebSocketEventSourcing(url, options);
```

**After:**

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const protocol = yield * connect(url, options);
```

## ⚙️ Configuration

### Default Configuration

```typescript
export const DefaultWebSocketConfig = {
  defaultTimeout: 30000, // 30 seconds
  maxConcurrentCommands: 100,
  enableBatching: true,
  batchSize: 10,
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
} as const;
```

### Configuration Options

```typescript
interface WebSocketConnectOptions {
  readonly context?: ProtocolContext;
  readonly config?: Partial<typeof DefaultWebSocketConfig>;
}
```

### Environment-Specific Configurations

**Development:**

```typescript
const protocol =
  yield *
  connect(url, {
    config: {
      defaultTimeout: 10000, // Faster feedback
      reconnectAttempts: 1, // Don't retry in dev
    },
  });
```

**Production:**

```typescript
const protocol =
  yield *
  connect(url, {
    config: {
      defaultTimeout: 60000, // More patience
      reconnectAttempts: 5, // Robust reconnection
      reconnectDelayMs: 5000, // Gradual backoff
    },
  });
```

**High-Performance:**

```typescript
const protocol =
  yield *
  connect(url, {
    config: {
      maxConcurrentCommands: 500, // Handle more load
      enableBatching: true, // Optimize throughput
      batchSize: 50, // Larger batches
    },
  });
```

## 🛠️ Advanced Usage

### Error Handling

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

const program = Effect.gen(function* () {
  const protocol = yield* connect('ws://localhost:8080').pipe(
    Effect.catchTag('ConnectionError', (error) => {
      console.error('Failed to connect:', error.message);
      return Effect.succeed(null);
    }),
    Effect.catchTag('StreamError', (error) => {
      console.error('Stream error:', error.message);
      return Effect.succeed(null);
    })
  );

  return protocol;
});
```

### Connection Lifecycle Management

```typescript
import { connect } from '@codeforbreakfast/eventsourcing-websocket';

// Automatic cleanup with Scope
const program = Effect.scoped(
  Effect.gen(function* () {
    const protocol = yield* connect("ws://localhost:8080");

    // Use protocol for multiple operations
    const result1 = yield* protocol.sendCommand(...);
    const result2 = yield* protocol.subscribe(...);

    // Connection automatically cleaned up when scope exits
    return { result1, result2 };
  })
);
```

### Custom Transport Configuration

If you need to customize the underlying transport:

```typescript
import { createWebSocketConnector } from '@codeforbreakfast/eventsourcing-websocket';
import { connectWithCompleteStack } from '@codeforbreakfast/eventsourcing-websocket';

const connector = createWebSocketConnector();
// Configure connector if needed...

const protocol = yield * connectWithCompleteStack(connector, url);
```

## 📋 API Reference

### Primary Functions

#### `connect(url, options?)`

Connect to a WebSocket event sourcing server with one line of code.

**Parameters:**

- `url: string` - WebSocket server URL (e.g., "ws://localhost:8080")
- `options?: WebSocketConnectOptions` - Optional configuration

**Returns:** `Effect<EventSourcingProtocol, ConnectionError | StreamError, Scope>`

#### `createBasicProtocolContext(overrides?)`

Create a basic protocol context with sensible defaults.

**Parameters:**

- `overrides?: Partial<ProtocolContext>` - Context overrides

**Returns:** `ProtocolContext`

### Advanced Functions

#### `createWebSocketConnector()`

Create a pre-configured WebSocket connector for advanced use cases.

#### `createWebSocketProtocolStack()`

Create a complete WebSocket protocol stack as Effect layers.

#### `createWebSocketConnectorLayer()`

Create just the WebSocket connector layer for maximum flexibility.

### Migration Helpers

#### `connectWebSocket(url, options?)` _(deprecated)_

Legacy connection method for backward compatibility. Use `connect()` instead.

#### `createWebSocketProtocol(url, options?)`

Create protocol with explicit configuration for migration scenarios.

## 🔧 Dependencies

This package combines and depends on:

- **`@codeforbreakfast/eventsourcing-transport-websocket`** - WebSocket transport implementation
- **`@codeforbreakfast/eventsourcing-protocol-default`** - Default protocol implementation
- **`effect`** - Effect system for functional programming (peer dependency)

## 🌐 Compatibility

- **Node.js:** 18.0.0+
- **Browsers:** Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- **Runtimes:** Node.js, Bun, Browser
- **Frameworks:** Effect, Express, Fastify, Next.js, Vite

## 🧪 Testing

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Type checking
bun run typecheck

# Linting
bun run lint
```

## 📦 Package Structure

```
packages/eventsourcing-websocket/
├── src/
│   ├── index.ts              # Main exports and re-exports
│   └── lib/
│       ├── index.ts          # Core convenience API
│       └── index.test.ts     # Comprehensive tests
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please see our [contributing guidelines](../../CONTRIBUTING.md) for details.

## 📄 License

MIT - see [LICENSE](../../LICENSE) file for details.

## 🔗 Related Packages

- **[@codeforbreakfast/eventsourcing-transport-websocket](../eventsourcing-transport-websocket)** - WebSocket transport implementation
- **[@codeforbreakfast/eventsourcing-protocol-default](../eventsourcing-protocol-default)** - Default protocol implementation
- **[@codeforbreakfast/eventsourcing-store](../eventsourcing-store)** - Event store abstractions
- **[@codeforbreakfast/eventsourcing-aggregates](../eventsourcing-aggregates)** - Aggregate root implementations

---

**Made with ❤️ by [Code for Breakfast](https://github.com/codeforbreakfast)**
