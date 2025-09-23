import { Effect, Stream, Queue, Deferred, Duration, Schema } from 'effect';
import type { Client, TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';
import {
  makeTransportMessage,
  MessageParseError,
  type TransportMessage,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Minimum protocol needs:
// 1. Send command -> get result
// 2. Subscribe to events
// That's fucking IT!

export const Command = Schema.Struct({
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
export type Command = typeof Command.Type;

export const Event = Schema.Struct({
  position: EventStreamPosition,
  type: Schema.String,
  data: Schema.Unknown,
  timestamp: Schema.Date,
});
export type Event = typeof Event.Type;

export const CommandResult = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal('Success'),
    position: EventStreamPosition,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Failure'),
    error: Schema.String,
  })
);
export type CommandResult = typeof CommandResult.Type;

// ============================================================================
// Wire Protocol Messages - What goes over the transport
// ============================================================================

// Outgoing messages (client -> server)
export const CommandMessage = Schema.Struct({
  type: Schema.Literal('command'),
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
export type CommandMessage = typeof CommandMessage.Type;

export const SubscribeMessage = Schema.Struct({
  type: Schema.Literal('subscribe'),
  streamId: Schema.String,
});
export type SubscribeMessage = typeof SubscribeMessage.Type;

// Incoming messages (server -> client)
export const CommandResultMessage = Schema.Struct({
  type: Schema.Literal('command_result'),
  commandId: Schema.String,
  success: Schema.Boolean,
  position: Schema.optional(EventStreamPosition),
  error: Schema.optional(Schema.String),
});
export type CommandResultMessage = typeof CommandResultMessage.Type;

export const EventMessage = Schema.Struct({
  type: Schema.Literal('event'),
  streamId: Schema.String,
  position: EventStreamPosition,
  eventType: Schema.String,
  data: Schema.Unknown,
  timestamp: Schema.String,
});
export type EventMessage = typeof EventMessage.Type;

// Union of all possible incoming messages
export const IncomingMessage = Schema.Union(CommandResultMessage, EventMessage);
export type IncomingMessage = typeof IncomingMessage.Type;

interface ProtocolState {
  readonly pendingCommands: Map<string, Deferred.Deferred<CommandResult>>;
  readonly subscriptions: Map<string, Queue.Queue<Event>>;
}

export interface Protocol {
  readonly sendCommand: (command: Command) => Effect.Effect<CommandResult, TransportError, never>;
  readonly subscribe: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<Event, never, never>, TransportError, never>;
}

const parseTransportPayload = (message: TransportMessage) =>
  Effect.try(() => JSON.parse(message.payload)).pipe(
    Effect.catchAll(() =>
      Effect.fail(
        new MessageParseError({
          message: 'Failed to parse transport payload as JSON',
          rawData: message.payload,
        })
      )
    )
  );

const validateIncomingMessage = (rawPayload: unknown) =>
  Schema.decodeUnknown(IncomingMessage)(rawPayload).pipe(
    Effect.catchAll(() =>
      Effect.fail(
        new MessageParseError({
          message: 'Invalid incoming message format',
          rawData: rawPayload,
        })
      )
    )
  );

const handleCommandResult = (state: ProtocolState) => (message: CommandResultMessage) =>
  Effect.suspend(() => {
    const deferred = state.pendingCommands.get(message.commandId);
    if (!deferred) return Effect.void;

    state.pendingCommands.delete(message.commandId);
    const result: CommandResult = message.success
      ? { _tag: 'Success', position: message.position! }
      : { _tag: 'Failure', error: message.error! };
    return Deferred.succeed(deferred, result);
  });

const handleEvent = (state: ProtocolState) => (message: EventMessage) =>
  Effect.suspend(() => {
    const queue = state.subscriptions.get(message.streamId);
    if (!queue) return Effect.void;

    return Queue.offer(queue, {
      position: message.position,
      type: message.eventType,
      data: message.data,
      timestamp: new Date(message.timestamp),
    });
  });

const handleMessage = (state: ProtocolState) => (message: TransportMessage) =>
  parseTransportPayload(message).pipe(
    Effect.flatMap(validateIncomingMessage),
    Effect.flatMap((wireMessage) => {
      switch (wireMessage.type) {
        case 'command_result':
          return handleCommandResult(state)(wireMessage);
        case 'event':
          return handleEvent(state)(wireMessage);
        default:
          return Effect.void;
      }
    }),
    Effect.catchAll(() => Effect.void) // Silently ignore malformed messages
  );

const encodeCommandMessage = (command: Command): CommandMessage => ({
  type: 'command',
  id: command.id,
  target: command.target,
  name: command.name,
  payload: command.payload,
});

const createCommandSender =
  (state: ProtocolState, transport: Client.Transport) => (command: Command) =>
    Deferred.make<CommandResult>().pipe(
      Effect.tap((deferred) => Effect.sync(() => state.pendingCommands.set(command.id, deferred))),
      Effect.tap(() => {
        const wireMessage = encodeCommandMessage(command);
        return transport.publish(
          makeTransportMessage(command.id, 'command', JSON.stringify(wireMessage), {
            timestamp: new Date().toISOString(),
          })
        );
      }),
      Effect.flatMap((deferred) =>
        Deferred.await(deferred).pipe(
          Effect.timeout(Duration.seconds(10)),
          Effect.catchTag('TimeoutException', () =>
            Effect.succeed({
              _tag: 'Failure' as const,
              error: 'Command timed out',
            })
          )
        )
      )
    );

const encodeSubscribeMessage = (streamId: string): SubscribeMessage => ({
  type: 'subscribe',
  streamId,
});

const createSubscriber =
  (state: ProtocolState, transport: Client.Transport) => (streamId: string) =>
    Queue.unbounded<Event>().pipe(
      Effect.tap((queue) => Effect.sync(() => state.subscriptions.set(streamId, queue))),
      Effect.tap(() => {
        const wireMessage = encodeSubscribeMessage(streamId);
        return transport.publish(
          makeTransportMessage(crypto.randomUUID(), 'subscribe', JSON.stringify(wireMessage), {
            timestamp: new Date().toISOString(),
          })
        );
      }),
      Effect.map(Stream.fromQueue)
    );

export const createProtocol = (
  transport: Client.Transport
): Effect.Effect<Protocol, TransportError, never> =>
  Effect.sync(() => ({
    pendingCommands: new Map<string, Deferred.Deferred<CommandResult>>(),
    subscriptions: new Map<string, Queue.Queue<Event>>(),
  })).pipe(
    Effect.flatMap((state) =>
      Effect.forkDaemon(
        transport
          .subscribe()
          .pipe(Effect.flatMap((stream) => Stream.runForEach(stream, handleMessage(state))))
      ).pipe(
        Effect.as({
          sendCommand: createCommandSender(state, transport),
          subscribe: createSubscriber(state, transport),
        })
      )
    )
  );
