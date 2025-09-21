# Schema-Based Transport Architecture

## The Problem with String-Based Transports

Using `string` everywhere is like using `any` in TypeScript - it compiles, but ye lose all the benefits of proper typing:

```typescript
// BAD: String-based transport (no type safety)
interface BadTransport {
  publish: (streamId: string, data: string) => Effect<void>;
  subscribe: (streamId: string) => Stream<string>;
}

// Every implementation needs to handle encoding/decoding manually
// No compile-time guarantees about message structure
// Runtime errors when message formats don't match
```

## The Schema-Based Solution

The new approach separates concerns properly:

1. **Raw Transport**: Handles wire-level communication (WebSocket, HTTP, binary, etc.)
2. **Schema Codec**: Handles encoding/decoding with validation
3. **Schema Transport**: Provides type-safe interface with automatic encoding/decoding

## Architecture Overview

```
Domain Layer (Event Sourcing)
    ↓ (typed messages)
Schema Transport Layer
    ↓ (automatic encoding/decoding)
Raw Transport Layer
    ↓ (wire format: string/binary/etc.)
Network/Storage
```

## Key Interfaces

### RawTransport<TWireFormat>

Handles the actual wire communication without caring about message structure:

```typescript
interface RawTransport<TWireFormat, R = never> {
  publishRaw: (streamId: string, wireData: TWireFormat) => Effect<void, Error, R>;
  subscribeRaw: (streamId: string) => Stream<RawMessage<TWireFormat>, Error, R>;
  // ... connection management
}
```

### TransportCodec<TMessage, TWireFormat>

Defines how to encode/decode messages with validation:

```typescript
interface TransportCodec<TMessage, TWireFormat> {
  messageSchema: Schema.Schema<TMessage, unknown>;
  encode: (message: TMessage) => Effect<TWireFormat, ParseError>;
  decode: (wire: TWireFormat) => Effect<TMessage, ParseError>;
}
```

### SchemaTransport<TMessage>

Type-safe transport interface that automatically handles encoding/decoding:

```typescript
interface SchemaTransport<TMessage, TStreamId = string, R = never> {
  publish: (streamId: TStreamId, message: TMessage) => Effect<void, Error, R>;
  subscribe: (streamId: TStreamId) => Stream<ProtocolMessage<TMessage>, Error, R>;
  // ... health/metrics/connection
}
```

## Implementation Examples

### WebSocket Transport (JSON over WebSocket)

```typescript
// 1. Create raw transport that handles WebSocket specifics
class WebSocketRawTransport implements RawTransport<string> {
  publishRaw = (streamId: string, wireData: string) => {
    // Send JSON string over WebSocket
    this.socket.send(JSON.stringify({ streamId, data: wireData }));
  };

  subscribeRaw = (streamId: string) => {
    // Listen for WebSocket messages and parse JSON
    return Stream.fromEventListener(this.socket, 'message').map((event) => JSON.parse(event.data));
  };
}

// 2. Define message schema
const EventSchema = Schema.Struct({
  type: Schema.String,
  aggregateId: Schema.String,
  data: Schema.Unknown,
});

// 3. Create schema transport with JSON codec
const transport = makeSchemaTransport(
  new WebSocketRawTransport('ws://localhost:8080'),
  Codecs.json(EventSchema)
);

// 4. Use with full type safety
await transport.publish('events', {
  type: 'UserCreated', // ✅ Type-safe
  aggregateId: 'user-123', // ✅ Type-safe
  data: { name: 'John' }, // ✅ Type-safe
  invalidField: 'oops', // ❌ Compile error!
});
```

### HTTP Transport (REST API)

```typescript
class HttpRawTransport implements RawTransport<string> {
  publishRaw = (streamId: string, wireData: string) =>
    Effect.tryPromise({
      try: () =>
        fetch(`/streams/${streamId}`, {
          method: 'POST',
          body: wireData,
          headers: { 'Content-Type': 'application/json' },
        }),
      catch: (error) => new TransportPublishError({ message: String(error), streamId }),
    });

  subscribeRaw = (streamId: string) =>
    // Could use SSE, WebSocket, or polling
    Stream.fromReadableStream(() => fetch(`/streams/${streamId}/subscribe`).then((r) => r.body));
}
```

### In-Memory Transport (Testing)

```typescript
class InMemoryRawTransport<T> implements RawTransport<T> {
  private streams = new Map<string, T[]>();

  publishRaw = (streamId: string, wireData: T) =>
    Effect.sync(() => {
      this.streams.get(streamId)?.push(wireData);
    });

  subscribeRaw = (streamId: string) => Stream.fromIterable(this.streams.get(streamId) ?? []);
}

// Use with identity codec (no encoding needed)
const testTransport = makeSchemaTransport(new InMemoryRawTransport(), Codecs.identity(EventSchema));
```

### Binary Transport (Protobuf/MessagePack)

```typescript
class BinaryRawTransport implements RawTransport<Uint8Array> {
  publishRaw = (streamId: string, wireData: Uint8Array) => {
    // Send binary data over TCP/gRPC/etc.
  };
}

const binaryTransport = makeSchemaTransport(
  new BinaryRawTransport(),
  Codecs.binary(EventSchema, msgpackEncode, msgpackDecode)
);
```

## Built-in Codecs

### JSON Codec

```typescript
const jsonCodec = Codecs.json(MySchema);
// Encodes to/from JSON strings with validation
```

### Identity Codec

```typescript
const identityCodec = Codecs.identity(MySchema);
// No encoding, just validation (for in-memory/testing)
```

### Binary Codec

```typescript
const binaryCodec = Codecs.binary(
  MySchema,
  msgpack.encode, // Your binary encoder
  msgpack.decode // Your binary decoder
);
```

## Benefits

### 1. Type Safety

- Compile-time guarantees about message structure
- No runtime type errors from mismatched schemas
- IDE autocomplete and refactoring support

### 2. Separation of Concerns

- Raw transports only handle wire communication
- Codecs only handle encoding/decoding
- Business logic works with typed messages

### 3. Composability

- Mix and match any raw transport with any codec
- Easy to add new transports or encoding formats
- Testable in isolation

### 4. Error Handling

- Schema validation errors are typed and handleable
- Transport errors separate from encoding errors
- Clear error boundaries

### 5. Performance

- Raw transports can optimize for their specific medium
- Codecs can be swapped for performance (JSON vs binary)
- No unnecessary string conversions

## Usage Patterns

### Event Sourcing Integration

```typescript
// Define your domain events
const DomainEventSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('UserCreated'),
    aggregateId: Schema.String,
    data: Schema.Struct({
      name: Schema.String,
      email: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal('UserUpdated'),
    aggregateId: Schema.String,
    data: Schema.Struct({
      name: Schema.String,
    }),
  })
);

// Create transport
const eventTransport = makeSchemaTransport(
  new WebSocketRawTransport('ws://events.example.com'),
  Codecs.json(DomainEventSchema)
);

// Use in event store
export const publishEvent = (event: DomainEvent) =>
  eventTransport.publish(event.aggregateId, event);

export const subscribeToEvents = (aggregateId: string) => eventTransport.subscribe(aggregateId);
```

### Multi-Protocol Support

```typescript
// Same schema, different transports
const httpTransport = makeSchemaTransport(httpRaw, Codecs.json(schema));
const wsTransport = makeSchemaTransport(wsRaw, Codecs.json(schema));
const binaryTransport = makeSchemaTransport(tcpRaw, Codecs.binary(schema, encode, decode));

// Choose transport based on needs
const transport = config.realtime ? wsTransport : httpTransport;
```

## Migration Guide

### From String-Based Transport

```typescript
// OLD: String-based
const oldTransport: Transport<string> = createOldTransport();
await oldTransport.publish('stream', JSON.stringify(data));

// NEW: Schema-based
const newTransport = makeSchemaTransport(rawTransport, Codecs.json(schema));
await newTransport.publish('stream', data); // Type-safe!
```

### Gradual Migration Strategy

1. Create schema for existing messages
2. Wrap existing transport with schema layer
3. Update consumers to use typed interface
4. Replace raw transport implementation if needed

This design gives us the best of both worlds: the flexibility to support any transport mechanism while maintaining complete type safety and clear separation of concerns.
