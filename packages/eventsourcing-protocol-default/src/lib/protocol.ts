import {
  Effect,
  Stream,
  Queue,
  Deferred,
  Duration,
  Schema,
  HashMap,
  Ref,
  Data,
  pipe,
  Option,
} from 'effect';
import {
  makeTransportMessage,
  type Client,
  type TransportError,
  type TransportMessage,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Minimum protocol needs:
// 1. Send command -> get result
// 2. Subscribe to events
// That's fucking IT!

// Domain errors
export class CommandTimeoutError extends Data.TaggedError('CommandTimeoutError')<{
  readonly commandId: string;
  readonly timeoutMs: number;
}> {}

export class ProtocolValidationError extends Data.TaggedError('ProtocolValidationError')<{
  readonly message: string;
  readonly rawData: unknown;
}> {}

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
  readonly pendingCommands: HashMap.HashMap<string, Deferred.Deferred<CommandResult>>;
  readonly subscriptions: HashMap.HashMap<string, Queue.Queue<Event>>;
}

export interface Protocol {
  readonly sendCommand: (
    command: Command
  ) => Effect.Effect<CommandResult, TransportError | CommandTimeoutError, never>;
  readonly subscribe: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<Event, never, never>, TransportError, never>;
}

const parseTransportPayload = (message: TransportMessage) =>
  pipe(
    Effect.try(() => JSON.parse(message.payload)),
    Effect.mapError(
      () =>
        new ProtocolValidationError({
          message: 'Failed to parse transport payload as JSON',
          rawData: message.payload,
        })
    )
  );

const validateIncomingMessage = (rawPayload: unknown) =>
  pipe(
    Schema.decodeUnknown(IncomingMessage)(rawPayload),
    Effect.mapError(
      () =>
        new ProtocolValidationError({
          message: 'Invalid incoming message format',
          rawData: rawPayload,
        })
    )
  );

const handleCommandResult = (stateRef: Ref.Ref<ProtocolState>) => (message: CommandResultMessage) =>
  pipe(
    Ref.get(stateRef),
    Effect.flatMap((state) => {
      const maybeDeferredOption = HashMap.get(state.pendingCommands, message.commandId);

      if (Option.isNone(maybeDeferredOption)) {
        return Effect.void; // Command not found, ignore
      }

      const deferred = maybeDeferredOption.value;
      const result: CommandResult = message.success
        ? { _tag: 'Success', position: message.position! }
        : { _tag: 'Failure', error: message.error! };

      return pipe(
        Ref.update(stateRef, (state) => ({
          ...state,
          pendingCommands: HashMap.remove(state.pendingCommands, message.commandId),
        })),
        Effect.flatMap(() => Deferred.succeed(deferred, result))
      );
    })
  );

const handleEvent = (stateRef: Ref.Ref<ProtocolState>) => (message: EventMessage) =>
  pipe(
    Ref.get(stateRef),
    Effect.flatMap((state) => {
      const maybeQueueOption = HashMap.get(state.subscriptions, message.streamId);

      if (Option.isNone(maybeQueueOption)) {
        return Effect.void; // Subscription not found, ignore
      }

      const queue = maybeQueueOption.value;
      return Queue.offer(queue, {
        position: message.position,
        type: message.eventType,
        data: message.data,
        timestamp: new Date(message.timestamp),
      });
    })
  );

const handleMessage = (stateRef: Ref.Ref<ProtocolState>) => (message: TransportMessage) =>
  pipe(
    parseTransportPayload(message),
    Effect.flatMap(validateIncomingMessage),
    Effect.flatMap((wireMessage) => {
      switch (wireMessage.type) {
        case 'command_result':
          return handleCommandResult(stateRef)(wireMessage);
        case 'event':
          return handleEvent(stateRef)(wireMessage);
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
  (stateRef: Ref.Ref<ProtocolState>, transport: Client.Transport) => (command: Command) =>
    pipe(
      Deferred.make<CommandResult>(),
      Effect.flatMap((deferred) =>
        pipe(
          Ref.update(stateRef, (state) => ({
            ...state,
            pendingCommands: HashMap.set(state.pendingCommands, command.id, deferred),
          })),
          Effect.flatMap(() => {
            const wireMessage = encodeCommandMessage(command);
            return transport.publish(
              makeTransportMessage(command.id, 'command', JSON.stringify(wireMessage), {
                timestamp: new Date().toISOString(),
              })
            );
          }),
          Effect.flatMap(() =>
            pipe(
              Deferred.await(deferred),
              Effect.timeout(Duration.seconds(10)),
              Effect.catchTag('TimeoutException', () =>
                Effect.fail(
                  new CommandTimeoutError({
                    commandId: command.id,
                    timeoutMs: 10000,
                  })
                )
              )
            )
          )
        )
      )
    );

const encodeSubscribeMessage = (streamId: string): SubscribeMessage => ({
  type: 'subscribe',
  streamId,
});

const createSubscriber =
  (stateRef: Ref.Ref<ProtocolState>, transport: Client.Transport) => (streamId: string) =>
    pipe(
      Queue.unbounded<Event>(),
      Effect.flatMap((queue) =>
        pipe(
          Ref.update(stateRef, (state) => ({
            ...state,
            subscriptions: HashMap.set(state.subscriptions, streamId, queue),
          })),
          Effect.flatMap(() => {
            const wireMessage = encodeSubscribeMessage(streamId);
            return transport.publish(
              makeTransportMessage(crypto.randomUUID(), 'subscribe', JSON.stringify(wireMessage), {
                timestamp: new Date().toISOString(),
              })
            );
          }),
          Effect.as(Stream.fromQueue(queue))
        )
      )
    );

export const createProtocol = (
  transport: Client.Transport
): Effect.Effect<Protocol, TransportError, never> =>
  pipe(
    Ref.make<ProtocolState>({
      pendingCommands: HashMap.empty(),
      subscriptions: HashMap.empty(),
    }),
    Effect.flatMap((stateRef) =>
      pipe(
        transport.subscribe(),
        Effect.flatMap((stream) =>
          Effect.forkDaemon(Stream.runForEach(stream, handleMessage(stateRef)))
        ),
        Effect.as({
          sendCommand: createCommandSender(stateRef, transport),
          subscribe: createSubscriber(stateRef, transport),
        })
      )
    )
  );
