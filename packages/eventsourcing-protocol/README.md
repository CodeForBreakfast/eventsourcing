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
import { Effect, pipe } from 'effect';
import { sendWireCommand } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const command: WireCommand;

const program = pipe(
  sendWireCommand(command),
  Effect.tap((result) =>
    Effect.sync(() => {
      if (result._tag === 'Success') {
        console.log('Command succeeded at position:', result.position);
      } else {
        console.error('Command failed:', result.error);
      }
    })
  )
);

// Provide transport layer when running (see eventsourcing-websocket for setup)
```

### Subscribing to Events

```typescript
import { Effect, Stream, pipe } from 'effect';
import { subscribe, type Event } from '@codeforbreakfast/eventsourcing-protocol';

const processEvent = (event: Event) =>
  Effect.sync(() => {
    console.log(`Event: ${event.type}`);
    console.log(`Position: ${event.position.eventNumber}`);
    console.log(`Data:`, event.data);
    console.log(`Timestamp:`, event.timestamp);
  });

const program = pipe(
  subscribe('user-123'),
  Effect.flatMap((eventStream) => Stream.runForEach(eventStream, processEvent))
);

// Provide transport layer when running
```

### Complete Example

```typescript
import { Effect, Stream, pipe } from 'effect';
import {
  sendWireCommand,
  subscribe,
  type Event,
  type ProtocolValidationError,
} from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const command: WireCommand;

const logEvent = (event: Event) => Effect.sync(() => console.log('Received event:', event.type));

const processEventsInBackground = (events: Stream.Stream<Event, ProtocolValidationError, never>) =>
  pipe(events, Stream.runForEach(logEvent), Effect.fork);

const application = pipe(
  subscribe('user-123'),
  Effect.flatMap((events) =>
    pipe(
      processEventsInBackground(events),
      Effect.flatMap(() => sendWireCommand(command))
    )
  )
);

// Setup transport layer (see @codeforbreakfast/eventsourcing-websocket)
// Then run: Effect.runPromise(application.pipe(Effect.provide(layer)))
```

## Server API

### ServerProtocol Service

The server-side protocol handles incoming commands and publishes events:

```typescript
import { Effect, Stream, pipe, Context } from 'effect';
import { ServerProtocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { toStreamId } from '@codeforbreakfast/eventsourcing-store';

const createSuccessResult = (target: string) =>
  pipe(
    toStreamId(target),
    Effect.map((streamId) => {
      const result: CommandResult = {
        _tag: 'Success' as const,
        position: { streamId, eventNumber: 1 },
      };
      return result;
    })
  );

const handleCommand = (
  protocol: Context.Tag.Service<typeof ServerProtocol>,
  command: WireCommand
) =>
  pipe(
    Effect.sync(() => console.log('Received command:', command.name)),
    Effect.flatMap(() => createSuccessResult(command.target)),
    Effect.flatMap((result) => protocol.sendResult(command.id, result))
  );

const serverProgram = pipe(
  ServerProtocol,
  Effect.flatMap((protocol) =>
    pipe(
      protocol.onWireCommand,
      Stream.runForEach((command) => handleCommand(protocol, command))
    )
  )
);

// Provide ServerProtocolLive with a server transport
// Effect.runPromise(serverProgram.pipe(Effect.provide(ServerProtocolLive(serverTransport))))
```

### Publishing Events

```typescript
import { Effect, pipe } from 'effect';
import { ServerProtocol, type Event } from '@codeforbreakfast/eventsourcing-protocol';
import { toStreamId } from '@codeforbreakfast/eventsourcing-store';

const publishEvent = (streamId: string, event: Event) =>
  pipe(
    toStreamId(streamId),
    Effect.flatMap((eventStreamId) =>
      pipe(
        ServerProtocol,
        Effect.flatMap((protocol) =>
          protocol.publishEvent({
            ...event,
            streamId: eventStreamId,
          })
        )
      )
    )
  );
```

## API Reference

### Client Functions

#### `sendWireCommand`

```typescript
import type { Effect } from 'effect';
import type { Protocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { TransportError } from '@codeforbreakfast/eventsourcing-transport';
import type { ProtocolCommandTimeoutError } from '@codeforbreakfast/eventsourcing-protocol';

declare const sendWireCommand: (
  command: WireCommand
) => Effect.Effect<CommandResult, TransportError | ProtocolCommandTimeoutError, Protocol>;
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
import type { Effect, Stream, Scope } from 'effect';
import type { Protocol } from '@codeforbreakfast/eventsourcing-protocol';
import type { Event } from '@codeforbreakfast/eventsourcing-store';
import type { TransportError } from '@codeforbreakfast/eventsourcing-transport';

declare const subscribe: (
  streamId: string
) => Effect.Effect<Stream.Stream<Event>, TransportError, Scope.Scope | Protocol>;
```

Subscribes to events from a specific stream.

**Parameters:**

- `streamId: string` - Stream identifier to subscribe to

**Returns:** Stream of events with `position`, `type`, `data`, `timestamp`

### Server Service

#### `ServerProtocol`

```typescript
import type { Effect, Stream } from 'effect';
import type { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { Event, ServerProtocolError } from '@codeforbreakfast/eventsourcing-protocol';
import type { TransportError } from '@codeforbreakfast/eventsourcing-transport';

interface ServerProtocolService {
  readonly onWireCommand: Stream.Stream<WireCommand, never, never>;
  readonly sendResult: (
    commandId: string,
    result: CommandResult
  ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
  readonly publishEvent: (
    event: Event & { readonly streamId: EventStreamId }
  ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
}
```

## Error Handling

```typescript
import { Effect, pipe } from 'effect';
import {
  sendWireCommand,
  ProtocolCommandTimeoutError,
} from '@codeforbreakfast/eventsourcing-protocol';
import { TransportError } from '@codeforbreakfast/eventsourcing-transport';
import type { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

declare const command: WireCommand;

const program = pipe(
  sendWireCommand(command),
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
import type { Event, EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

declare const wireCommandStructure: WireCommand;
declare const commandResultStructure: CommandResult;
declare const eventStructure: Event;
```

See the respective packages for full type definitions and validation schemas.

## License

MIT
