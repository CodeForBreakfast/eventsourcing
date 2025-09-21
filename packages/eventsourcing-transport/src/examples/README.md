# Connection-Gated Transport Pattern

This directory contains examples demonstrating the new connection-gated transport pattern that ensures proper resource management and makes it impossible to misuse the transport API.

## Key Improvements

### 1. **Connection Safety**

```typescript
// ❌ OLD: Can call methods without connecting
const transport = oldTransport();
transport.publish('stream', data); // Might fail silently or crash

// ✅ NEW: Must be connected to use methods
const transport = newTransport();
const result =
  yield *
  _(
    withTransport(
      transport,
      config,
      (connected) => connected.publish('stream', data) // Guaranteed to be connected
    )
  );
```

### 2. **Automatic Resource Management**

```typescript
// ❌ OLD: Manual connection lifecycle
const transport = oldTransport();
yield * _(transport.connect());
try {
  yield * _(transport.publish('stream', data));
} finally {
  yield * _(transport.close()); // Easy to forget!
}

// ✅ NEW: Automatic cleanup with Effect.acquireRelease
const result =
  yield *
  _(
    withTransport(transport, config, (connected) => connected.publish('stream', data))
    // Connection automatically cleaned up here
  );
```

### 3. **Type Safety**

```typescript
// ❌ OLD: TypeScript can't prevent misuse
interface OldTransport {
  connect(): Effect<void, Error>;
  publish(data: any): Effect<void, Error>; // Can be called anytime!
}

// ✅ NEW: Connected transport is a separate type
interface ConnectedTransport {
  publish(data: any): Effect<void, Error>; // Only available when connected
}

interface Transport {
  makeConnected(config): Effect<ConnectedTransport, Error, Scope>;
}
```

### 4. **Scope-Based Lifecycle**

The new pattern uses Effect's `Scope` to ensure connections are properly managed:

```typescript
const program = Effect.scoped(
  withTransport(transport, config, (connected) =>
    Effect.gen(function* (_) {
      // Multiple operations on the same connection
      yield* _(connected.publish('stream-1', data1));
      yield* _(connected.publish('stream-2', data2));

      const health = yield* _(connected.health);
      const metrics = yield* _(connected.metrics);

      return { health, metrics };
    })
  )
  // Connection closed automatically when scope ends
);
```

## Architecture

### Simple Transport

- `Transport<TData, TStreamId, R>` - Factory interface
- `ConnectedTransport<TData, TStreamId, R>` - Connected operations
- `withTransport()` - Helper for scoped usage

### Schema Transport

- `SchemaTransport<TMessage, TStreamId, R>` - Schema-aware factory
- `ConnectedSchemaTransport<TMessage, TStreamId, R>` - Connected schema operations
- `withSchemaTransport()` - Helper for scoped usage

### Raw Transport

- `RawTransport<TWireFormat, R>` - Wire-level factory
- `ConnectedRawTransport<TWireFormat, R>` - Connected wire operations
- `makeSchemaTransport()` - Builds schema transport from raw transport

## Implementation Examples

- **`in-memory-transport.ts`** - Complete in-memory implementation showing the pattern
- **`websocket-raw-transport.ts`** - WebSocket raw transport with schema layer

## Benefits

1. **Impossible to misuse** - TypeScript prevents calling methods on unconnected transports
2. **Automatic cleanup** - Resources are always properly released
3. **Composable** - Works naturally with Effect's composition patterns
4. **Testable** - Easy to mock and test with proper lifecycle management
5. **Concurrent-safe** - Multiple operations can share the same connection safely
6. **Error-safe** - Connection errors are properly typed and handled

## Migration Guide

To migrate from the old pattern:

1. Update transport implementations to return factory functions
2. Use `Effect.acquireRelease` for connection lifecycle
3. Replace direct method calls with `withTransport()` or `withSchemaTransport()`
4. Remove manual `connect()` and `close()` calls
5. Leverage Effect's scoping for proper resource management

The new pattern enforces best practices while maintaining all the flexibility and composability of the original design.
