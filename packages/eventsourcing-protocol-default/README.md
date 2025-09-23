# Event Sourcing Protocol

Protocol implementation for event sourcing over transport abstractions.

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-protocol-default
```

## Usage

```typescript
import { createProtocol } from '@codeforbreakfast/eventsourcing-protocol-default';
import { createTransport } from '@codeforbreakfast/eventsourcing-transport-websocket';

// Create protocol with a transport
const protocol = await Effect.runPromise(createTransport(url).pipe(Effect.flatMap(createProtocol)));

// Send commands
const result = await Effect.runPromise(
  protocol.sendCommand({
    id: crypto.randomUUID(),
    aggregate: 'user-123',
    name: 'UpdateProfile',
    payload: { name: 'John Doe' },
  })
);

// Subscribe to events
const eventStream = await Effect.runPromise(protocol.subscribe('user-123'));

await Effect.runPromise(
  Stream.runForEach(eventStream, (event) =>
    Effect.log(`Event: ${event.type} at position ${event.position.eventNumber}`)
  )
);
```

## API

### `createProtocol(transport)`

Creates a protocol instance from a transport connection.

**Parameters:**

- `transport: Client.Transport` - Connected transport instance

**Returns:** `Effect<Protocol, TransportError, never>`

### `Protocol.sendCommand(command)`

Sends a command and waits for the result.

**Parameters:**

- `command: Command` - Command to send
  - `id: string` - Unique command identifier
  - `aggregate: string` - Aggregate identifier
  - `name: string` - Command name
  - `payload: unknown` - Command data

**Returns:** `Effect<CommandResult, TransportError, never>`

Result contains:

- `success: boolean` - Whether command succeeded
- `position?: EventStreamPosition` - New stream position after command
- `error?: string` - Error message if command failed

Commands automatically timeout after 10 seconds.

### `Protocol.subscribe(streamId)`

Subscribes to events from a specific stream.

**Parameters:**

- `streamId: string` - Stream identifier to subscribe to

**Returns:** `Effect<Stream<Event>, TransportError, never>`

Each event contains:

- `position: EventStreamPosition` - Event position in stream
- `type: string` - Event type name
- `data: unknown` - Event payload
- `timestamp: Date` - When event occurred

## Message Format

The protocol exchanges JSON messages over the transport.

### Command Message

```json
{
  "type": "command",
  "id": "cmd-123",
  "aggregate": "user-456",
  "name": "UpdateProfile",
  "payload": { "name": "John" }
}
```

### Command Result Message

```json
{
  "type": "command_result",
  "commandId": "cmd-123",
  "success": true,
  "position": { "streamId": "user-456", "eventNumber": 42 }
}
```

### Subscribe Message

```json
{
  "type": "subscribe",
  "streamId": "user-456"
}
```

### Event Message

```json
{
  "type": "event",
  "streamId": "user-456",
  "position": { "streamId": "user-456", "eventNumber": 42 },
  "eventType": "ProfileUpdated",
  "data": { "name": "John" },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Error Handling

All operations return Effects that handle:

- Transport errors (connection failures, network issues)
- Timeout errors (commands timing out after 10 seconds)
- Parsing errors (gracefully caught and logged)

## Types

```typescript
interface Command {
  readonly id: string;
  readonly aggregate: string;
  readonly name: string;
  readonly payload: unknown;
}

interface Event {
  readonly position: EventStreamPosition;
  readonly type: string;
  readonly data: unknown;
  readonly timestamp: Date;
}

interface CommandResult {
  readonly success: boolean;
  readonly position?: EventStreamPosition;
  readonly error?: string;
}

interface Protocol {
  readonly sendCommand: (command: Command) => Effect<CommandResult, TransportError, never>;
  readonly subscribe: (streamId: string) => Effect<Stream<Event>, TransportError, never>;
}
```

## License

MIT
