# Event Sourcing Protocol

**Transport-agnostic protocol** for event sourcing command/event communication.

## Overview

This package provides the protocol layer that sits on top of any transport (WebSocket, HTTP, message queue). It handles:

- **Command/Result correlation** - Track which responses belong to which requests
- **Event subscriptions** - Stream events from the server to clients
- **Timeout handling** - Fail commands that take too long (10s default)
- **Error propagation** - Pass structured errors back to clients

**Key principle**: Your application code should use this package's API. Transport choice (WebSocket, etc.) is a deployment detail configured when setting up your Effect layers.

## Architecture

The protocol operates on public Wire API types:

- `WireCommand` - Commands sent from client to server (from `@codeforbreakfast/eventsourcing-commands`)
- `CommandResult` - Success/failure results (from `@codeforbreakfast/eventsourcing-commands`)
- `Event` - Domain events streamed to clients (from `@codeforbreakfast/eventsourcing-store`)

These types have `unknown` payloads because the protocol doesn't know your domain - it just routes messages. Validation happens in your domain layer

## Installation

```bash
bun add @codeforbreakfast/eventsourcing-protocol
```

**Note**: You'll also need a transport package for layer setup. See `@codeforbreakfast/eventsourcing-websocket` for WebSocket transport.

## Client API

### Sending Commands

```typescript
import { Effect } from 'effect';
import { sendWireCommand } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

const program = Effect.gen(function* () {
  const command: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-123',
    name: 'UpdateProfile',
    payload: { name: 'John Doe', email: 'john@example.com' },
  };

  const result = yield* sendWireCommand(command);

  if (result._tag === 'Success') {
    console.log('Command succeeded at position:', result.position);
  } else {
    console.error('Command failed:', result.error);
  }
});

// Provide transport layer when running (see eventsourcing-websocket for setup)
```

### Subscribing to Events

```typescript
import { Effect, Stream } from 'effect';
import { subscribe } from '@codeforbreakfast/eventsourcing-protocol';

const program = Effect.gen(function* () {
  // Subscribe to a stream
  const eventStream = yield* subscribe('user-123');

  // Process events
  yield* Stream.runForEach(eventStream, (event) =>
    Effect.sync(() => {
      console.log(`Event: ${event.type}`);
      console.log(`Position: ${event.position.eventNumber}`);
      console.log(`Data:`, event.data);
      console.log(`Timestamp:`, event.timestamp);
    })
  );
});

// Provide transport layer when running
```

### Complete Example

```typescript
import { Effect, Stream, pipe } from 'effect';
import { sendWireCommand, subscribe } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

const application = Effect.gen(function* () {
  // Subscribe to events first
  const events = yield* subscribe('user-123');

  // Process events in background
  yield* pipe(
    events,
    Stream.runForEach((event) => Effect.sync(() => console.log('Received event:', event.type))),
    Effect.fork
  );

  // Send a command
  const command: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-123',
    name: 'CreateUser',
    payload: { name: 'Alice', email: 'alice@example.com' },
  };

  const result = yield* sendWireCommand(command);
  return result;
});

// Setup transport layer (see @codeforbreakfast/eventsourcing-websocket)
// Then run: Effect.runPromise(application.pipe(Effect.provide(layer)))
```

## Server API

### ServerProtocol Service

The server-side protocol handles incoming commands and publishes events:

```typescript
import { Effect, Stream } from 'effect';
import { ServerProtocol, ServerProtocolLive } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { Event } from '@codeforbreakfast/eventsourcing-store';

const serverProgram = Effect.gen(function* () {
  const protocol = yield* ServerProtocol;

  // Listen for incoming commands
  yield* pipe(
    protocol.onWireCommand,
    Stream.runForEach((command: WireCommand) =>
      Effect.gen(function* () {
        console.log('Received command:', command.name);

        // Process command (your domain logic here)
        const result: CommandResult = {
          _tag: 'Success',
          position: { streamId: command.target, eventNumber: 1 },
        };

        // Send result back to client
        yield* protocol.sendResult(command.id, result);
      })
    )
  );
});

// Provide ServerProtocolLive with a server transport
// Effect.runPromise(serverProgram.pipe(Effect.provide(ServerProtocolLive(serverTransport))))
```

### Publishing Events

```typescript
import { Effect } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { Event } from '@codeforbreakfast/eventsourcing-store';

const publishEvent = (streamId: string, event: Event) =>
  Effect.gen(function* () {
    const protocol = yield* ServerProtocol;

    yield* protocol.publishEvent({
      ...event,
      streamId,
    });
  });
```

## API Reference

### Client Functions

#### `sendWireCommand`

```typescript
const sendWireCommand: (
  command: WireCommand
) => Effect<CommandResult, TransportError | ProtocolCommandTimeoutError, Protocol>;
```

Sends a command and waits for the result. Automatically times out after 10 seconds.

**Parameters:**

- `command: WireCommand` - Command with `id`, `target`, `name`, `payload`

**Returns:**

- `Success`: Command executed successfully with event stream position
- `Failure`: Command failed with structured error details

**Errors:**

- `ProtocolCommandTimeoutError` - Command timed out (10 seconds)
- `TransportError` - Network/connection error

#### `subscribe`

```typescript
const subscribe: (streamId: string) => Effect<Stream<Event>, TransportError, Scope | Protocol>;
```

Subscribes to events from a specific stream.

**Parameters:**

- `streamId: string` - Stream identifier to subscribe to

**Returns:** Stream of events with `position`, `type`, `data`, `timestamp`

### Server Service

#### `ServerProtocol`

```typescript
interface ServerProtocol {
  readonly onWireCommand: Stream<WireCommand>;
  readonly sendResult: (commandId: string, result: CommandResult) => Effect<void>;
  readonly publishEvent: (event: Event & { streamId: string }) => Effect<void>;
}
```

## Error Handling

```typescript
import { Effect } from 'effect';
import {
  sendWireCommand,
  ProtocolCommandTimeoutError,
} from '@codeforbreakfast/eventsourcing-protocol';
import { TransportError } from '@codeforbreakfast/eventsourcing-transport';

const program = Effect.gen(function* () {
  const result = yield* sendWireCommand(command);
  return result;
}).pipe(
  Effect.catchTags({
    ProtocolCommandTimeoutError: (error) =>
      Effect.sync(() => console.error('Command timed out:', error.commandId)),
    TransportError: (error) => Effect.sync(() => console.error('Transport error:', error.message)),
  })
);
```

## Wire API Types

This package works with types from other packages:

```typescript
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { Event } from '@codeforbreakfast/eventsourcing-store';

// WireCommand structure
interface WireCommand {
  readonly id: string; // Unique command ID
  readonly target: string; // Target aggregate/stream
  readonly name: string; // Command name
  readonly payload: unknown; // Command data (unvalidated)
}

// CommandResult tagged union
type CommandResult =
  | { _tag: 'Success'; position: EventStreamPosition }
  | { _tag: 'Failure'; error: CommandError };

// Event structure
interface Event {
  readonly position: EventStreamPosition;
  readonly type: string; // Event type
  readonly data: unknown; // Event data
  readonly timestamp: Date;
}
```

See the respective packages for full type definitions and validation schemas.

## License

MIT
