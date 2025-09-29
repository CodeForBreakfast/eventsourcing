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
  Layer,
  Scope,
  Match,
  Clock,
} from 'effect';
import {
  makeTransportMessage,
  type Client,
  type TransportError,
  type TransportMessage,
} from '@codeforbreakfast/eventsourcing-transport';
import { EventStreamPosition, Event } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { ReadonlyDeep } from 'type-fest';

// Minimum protocol needs:
// 1. Send command -> get result
// 2. Subscribe to events
// That's fucking IT!

// Domain errors
export class WireCommandTimeoutError extends Data.TaggedError('WireCommandTimeoutError')<{
  readonly commandId: string;
  readonly timeoutMs: number;
}> {}

export class ProtocolValidationError extends Data.TaggedError('ProtocolValidationError')<{
  readonly message: string;
  readonly rawData: unknown;
  readonly cause?: unknown;
}> {}

export class ProtocolStateError extends Data.TaggedError('ProtocolStateError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

// Re-export Event for convenience
export { Event };

// ============================================================================
// Timestamp Schema
// ============================================================================

// Helper to generate current timestamp using Effect Clock service
const currentTimestamp = () =>
  pipe(
    Clock.currentTimeMillis,
    Effect.map((millis) => new Date(millis))
  );

// ============================================================================
// Wire Protocol Messages - What goes over the transport
// ============================================================================

// Outgoing messages (client -> server)
export const WireCommandMessage = Schema.Struct({
  type: Schema.Literal('command'),
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
export type WireCommandMessage = typeof WireCommandMessage.Type;

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
  timestamp: Schema.DateFromString,
});
export type EventMessage = typeof EventMessage.Type;

// Union of all possible incoming messages
export const IncomingMessage = Schema.Union(CommandResultMessage, EventMessage);
export type IncomingMessage = ReadonlyDeep<typeof IncomingMessage.Type>;

interface ProtocolState {
  readonly pendingWireCommands: HashMap.HashMap<string, Deferred.Deferred<CommandResult>>;
  readonly subscriptions: HashMap.HashMap<string, Queue.Queue<Event>>;
}

export interface ProtocolService {
  readonly sendWireCommand: (
    command: ReadonlyDeep<WireCommand>
  ) => Effect.Effect<
    CommandResult,
    TransportError | WireCommandTimeoutError | ProtocolValidationError,
    never
  >;
  readonly subscribe: (
    streamId: string
  ) => Effect.Effect<
    Stream.Stream<Event, ProtocolValidationError, never>,
    TransportError | ProtocolValidationError,
    never
  >;
}

export class Protocol extends Effect.Tag('Protocol')<Protocol, ProtocolService>() {}

const parseTransportPayload = (message: ReadonlyDeep<TransportMessage>) =>
  pipe(
    Effect.try({
      try: () => JSON.parse(message.payload),
      catch: (cause) =>
        new ProtocolValidationError({
          message: 'Failed to parse transport payload as JSON',
          rawData: message.payload,
          cause,
        }),
    })
  );

const validateIncomingMessage = (rawPayload: unknown) =>
  pipe(
    Schema.decodeUnknown(IncomingMessage)(rawPayload),
    Effect.mapError(
      (cause) =>
        new ProtocolValidationError({
          message: 'Invalid incoming message format',
          rawData: rawPayload,
          cause,
        })
    )
  );

const createCommandResult = (
  message: ReadonlyDeep<CommandResultMessage>
): Effect.Effect<CommandResult, ProtocolStateError> =>
  pipe(
    Match.value(message),
    Match.when({ success: true }, (msg) =>
      pipe(
        Option.fromNullable(msg.position),
        Option.match({
          onNone: () =>
            Effect.fail(
              new ProtocolStateError({
                operation: 'command_result',
                reason: 'Success result missing position',
              })
            ),
          onSome: (position) => Effect.succeed({ _tag: 'Success' as const, position }),
        })
      )
    ),
    Match.when({ success: false }, (msg) =>
      pipe(
        Option.fromNullable(msg.error),
        Option.match({
          onNone: () =>
            Effect.fail(
              new ProtocolStateError({
                operation: 'command_result',
                reason: 'Failure result missing error',
              })
            ),
          onSome: (error) =>
            Effect.succeed({
              _tag: 'Failure' as const,
              error: {
                _tag: 'UnknownError' as const,
                commandId: message.commandId,
                message: error,
              },
            }),
        })
      )
    ),
    Match.exhaustive
  );

const handleCommandResult =
  (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<CommandResultMessage>) =>
    pipe(
      Ref.get(stateRef),
      Effect.flatMap((state) =>
        pipe(
          HashMap.get(state.pendingWireCommands, message.commandId),
          Option.match({
            onNone: () => Effect.void, // WireCommand not found, ignore
            onSome: (deferred) =>
              pipe(
                createCommandResult(message),
                Effect.flatMap((result) =>
                  pipe(
                    Ref.update(stateRef, (state) => ({
                      ...state,
                      pendingWireCommands: HashMap.remove(
                        state.pendingWireCommands,
                        message.commandId
                      ),
                    })),
                    Effect.flatMap(() => Deferred.succeed(deferred, result))
                  )
                ),
                Effect.catchAll(() => Effect.void) // Ignore malformed command results
              ),
          })
        )
      )
    );

const handleEvent = (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<EventMessage>) =>
  pipe(
    Ref.get(stateRef),
    Effect.flatMap((state) =>
      pipe(
        HashMap.get(state.subscriptions, message.streamId),
        Option.match({
          onNone: () => Effect.succeed(true), // Subscription not found, ignore
          onSome: (queue) =>
            Queue.offer(queue, {
              position: message.position,
              type: message.eventType,
              data: message.data,
              timestamp: message.timestamp,
            }),
        })
      )
    )
  );

const handleMessage =
  (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<TransportMessage>) =>
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

const encodeWireCommandMessage = (command: ReadonlyDeep<WireCommand>): WireCommandMessage => ({
  type: 'command',
  id: command.id,
  target: command.target,
  name: command.name,
  payload: command.payload,
});

const cleanupPendingWireCommand = (stateRef: Ref.Ref<ProtocolState>, commandId: string) =>
  Ref.update(stateRef, (state) => ({
    ...state,
    pendingWireCommands: HashMap.remove(state.pendingWireCommands, commandId),
  }));

const createWireCommandSender =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (command: ReadonlyDeep<WireCommand>) =>
    pipe(
      Deferred.make<CommandResult>(),
      Effect.flatMap((deferred) =>
        pipe(
          Effect.acquireRelease(
            pipe(
              Ref.update(stateRef, (state) => ({
                ...state,
                pendingWireCommands: HashMap.set(state.pendingWireCommands, command.id, deferred),
              })),
              Effect.as(deferred)
            ),
            () => cleanupPendingWireCommand(stateRef, command.id)
          ),
          Effect.flatMap(() =>
            pipe(
              currentTimestamp(),
              Effect.map((timestamp) => {
                const wireMessage = encodeWireCommandMessage(command);
                return transport.publish(
                  makeTransportMessage(command.id, 'command', JSON.stringify(wireMessage), {
                    timestamp: timestamp.toISOString(),
                  })
                );
              }),
              Effect.flatten
            )
          ),
          Effect.flatMap(() =>
            pipe(
              Deferred.await(deferred),
              Effect.timeout(Duration.seconds(10)),
              Effect.catchTag('TimeoutException', () =>
                Effect.fail(
                  new WireCommandTimeoutError({
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

const cleanupSubscription = (stateRef: Ref.Ref<ProtocolState>, streamId: string) =>
  Ref.update(stateRef, (state) => ({
    ...state,
    subscriptions: HashMap.remove(state.subscriptions, streamId),
  }));

const createSubscriber =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (streamId: string) =>
    pipe(
      Queue.unbounded<Event>(),
      Effect.flatMap((queue) =>
        pipe(
          // First, add the subscription to state
          Ref.update(stateRef, (state) => ({
            ...state,
            subscriptions: HashMap.set(state.subscriptions, streamId, queue),
          })),
          Effect.flatMap(() =>
            pipe(
              currentTimestamp(),
              Effect.map((timestamp) => {
                const wireMessage = encodeSubscribeMessage(streamId);
                return transport.publish(
                  makeTransportMessage(
                    crypto.randomUUID(),
                    'subscribe',
                    JSON.stringify(wireMessage),
                    {
                      timestamp: timestamp.toISOString(),
                    }
                  )
                );
              }),
              Effect.flatten
            )
          ),
          Effect.as(
            // Return a scoped stream that cleans up the subscription when the stream is closed
            Stream.acquireRelease(Effect.succeed(queue), () =>
              cleanupSubscription(stateRef, streamId)
            ).pipe(Stream.flatMap(Stream.fromQueue))
          )
        )
      )
    );

const createProtocolService = (
  transport: ReadonlyDeep<Client.Transport>
): Effect.Effect<ProtocolService, TransportError, Scope.Scope> =>
  pipe(
    Ref.make<ProtocolState>({
      pendingWireCommands: HashMap.empty(),
      subscriptions: HashMap.empty(),
    }),
    Effect.flatMap((stateRef) =>
      pipe(
        transport.subscribe(),
        Effect.flatMap((stream) =>
          pipe(
            Effect.forkScoped(Stream.runForEach(stream, handleMessage(stateRef))),
            Effect.as({
              sendWireCommand: (command: ReadonlyDeep<WireCommand>) =>
                pipe(createWireCommandSender(stateRef, transport)(command), Effect.scoped),
              subscribe: (streamId: string) => createSubscriber(stateRef, transport)(streamId),
            })
          )
        )
      )
    )
  );

export const ProtocolLive = (transport: ReadonlyDeep<Client.Transport>) =>
  Layer.scoped(Protocol, createProtocolService(transport));

// Convenience functions for using the service
export const sendWireCommand = (command: ReadonlyDeep<WireCommand>) =>
  pipe(
    Protocol,
    Effect.flatMap((protocol) => protocol.sendWireCommand(command))
  );

export const subscribe = (streamId: string) =>
  pipe(
    Protocol,
    Effect.flatMap((protocol) => protocol.subscribe(streamId))
  );
