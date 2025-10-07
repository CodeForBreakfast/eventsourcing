import {
  Context,
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
  Effect,
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
export class ProtocolCommandTimeoutError extends Data.TaggedError('ProtocolCommandTimeoutError')<{
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
// OpenTelemetry Trace Context Schema
// ============================================================================

const TraceContext = Schema.Struct({
  traceId: Schema.String,
  parentId: Schema.String,
});

// ============================================================================
// Wire Protocol Messages - What goes over the transport
// ============================================================================

// Outgoing messages (client -> server)
export const ProtocolCommand = Schema.Struct({
  type: Schema.Literal('command'),
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
  context: TraceContext,
});
export type ProtocolCommand = typeof ProtocolCommand.Type;

export const ProtocolSubscribe = Schema.Struct({
  type: Schema.Literal('subscribe'),
  streamId: Schema.String,
  context: TraceContext,
});
export type ProtocolSubscribe = typeof ProtocolSubscribe.Type;

// Union of all possible server incoming messages (client -> server)
export const ProtocolServerIncoming = Schema.Union(ProtocolCommand, ProtocolSubscribe);
export type ProtocolServerIncoming = ReadonlyDeep<typeof ProtocolServerIncoming.Type>;

// Incoming messages (server -> client)
export const ProtocolCommandResult = Schema.Struct({
  type: Schema.Literal('command_result'),
  commandId: Schema.String,
  success: Schema.Boolean,
  position: Schema.optional(EventStreamPosition),
  error: Schema.optional(Schema.String),
  context: TraceContext,
});
export type ProtocolCommandResult = typeof ProtocolCommandResult.Type;

export const ProtocolEvent = Schema.Struct({
  type: Schema.Literal('event'),
  streamId: Schema.String,
  position: EventStreamPosition,
  eventType: Schema.String,
  data: Schema.Unknown,
  timestamp: Schema.DateFromString,
  context: TraceContext,
});
export type ProtocolEvent = typeof ProtocolEvent.Type;

// Union of all possible incoming messages
export const ProtocolIncoming = Schema.Union(ProtocolCommandResult, ProtocolEvent);
export type ProtocolIncoming = ReadonlyDeep<typeof ProtocolIncoming.Type>;

interface ProtocolState {
  readonly pendingCommands: HashMap.HashMap<string, Deferred.Deferred<CommandResult>>;
  readonly subscriptions: HashMap.HashMap<string, Queue.Queue<Event>>;
}

export class Protocol extends Context.Tag('Protocol')<
  Protocol,
  {
    readonly sendWireCommand: (
      command: ReadonlyDeep<WireCommand>
    ) => Effect.Effect<
      CommandResult,
      TransportError | ProtocolCommandTimeoutError | ProtocolValidationError,
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
>() {}

const parseTransportPayload = (message: ReadonlyDeep<TransportMessage>) =>
  Effect.try({
    try: () => JSON.parse(message.payload),
    catch: (cause) =>
      new ProtocolValidationError({
        message: 'Failed to parse transport payload as JSON',
        rawData: message.payload,
        cause,
      }),
  });

const validateIncomingMessage = (rawPayload: unknown) =>
  pipe(
    rawPayload,
    Schema.decodeUnknown(ProtocolIncoming),
    Effect.mapError(
      (cause) =>
        new ProtocolValidationError({
          message: 'Invalid incoming message format',
          rawData: rawPayload,
          cause,
        })
    )
  );

const handleSuccessResult = (
  msg: ReadonlyDeep<ProtocolCommandResult & { readonly success: true }>
): Effect.Effect<CommandResult, ProtocolStateError> =>
  pipe(
    msg.position,
    Option.fromNullable,
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
  );

const handleFailureResult = (
  msg: ReadonlyDeep<ProtocolCommandResult & { readonly success: false }>
): Effect.Effect<CommandResult, ProtocolStateError> =>
  pipe(
    msg.error,
    Option.fromNullable,
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
            commandId: msg.commandId,
            message: error,
          },
        }),
    })
  );

const createCommandResult = (
  message: ReadonlyDeep<ProtocolCommandResult>
): Effect.Effect<CommandResult, ProtocolStateError> =>
  pipe(
    message,
    Match.value,
    Match.when({ success: true }, handleSuccessResult),
    Match.when({ success: false }, handleFailureResult),
    Match.exhaustive
  );

const updateStateAndCompleteDeferred =
  (
    stateRef: Ref.Ref<ProtocolState>,
    commandId: string,
    deferred: Deferred.Deferred<CommandResult>
  ) =>
  (result: CommandResult) =>
    pipe(
      Ref.update(stateRef, (state) => ({
        ...state,
        pendingCommands: HashMap.remove(state.pendingCommands, commandId),
      })),
      Effect.andThen(Deferred.succeed(deferred, result))
    );

const processDeferredCommandResult =
  (stateRef: Ref.Ref<ProtocolState>, message: ReadonlyDeep<ProtocolCommandResult>) =>
  (deferred: Deferred.Deferred<CommandResult>) =>
    pipe(
      message,
      createCommandResult,
      Effect.flatMap(updateStateAndCompleteDeferred(stateRef, message.commandId, deferred)),
      Effect.catchAll(() => Effect.void)
    );

const matchPendingCommand =
  (stateRef: Ref.Ref<ProtocolState>, message: ReadonlyDeep<ProtocolCommandResult>) =>
  (state: ProtocolState) =>
    pipe(
      state.pendingCommands,
      (commands) => HashMap.get(commands, message.commandId),
      Option.match({
        onNone: () => Effect.void,
        onSome: processDeferredCommandResult(stateRef, message),
      })
    );

const handleCommandResult =
  (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<ProtocolCommandResult>) =>
    pipe(stateRef, Ref.get, Effect.flatMap(matchPendingCommand(stateRef, message)));

const offerEventToQueue = (message: ReadonlyDeep<ProtocolEvent>) => (state: ProtocolState) =>
  pipe(
    HashMap.get(state.subscriptions, message.streamId),
    Option.match({
      onNone: () => Effect.succeed(true),
      onSome: (queue) =>
        Queue.offer(queue, {
          position: message.position,
          type: message.eventType,
          data: message.data,
          timestamp: message.timestamp,
        }),
    })
  );

const handleEvent = (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<ProtocolEvent>) =>
  pipe(stateRef, Ref.get, Effect.flatMap(offerEventToQueue(message)));

const routeWireMessage =
  (stateRef: Ref.Ref<ProtocolState>) => (wireMessage: ReadonlyDeep<ProtocolIncoming>) => {
    switch (wireMessage.type) {
      case 'command_result':
        return pipe(wireMessage, handleCommandResult(stateRef));
      case 'event':
        return pipe(wireMessage, handleEvent(stateRef));
      default:
        return Effect.void;
    }
  };

const handleMessage =
  (stateRef: Ref.Ref<ProtocolState>) => (message: ReadonlyDeep<TransportMessage>) =>
    pipe(
      message,
      parseTransportPayload,
      Effect.flatMap(validateIncomingMessage),
      Effect.flatMap(routeWireMessage(stateRef)),
      Effect.catchAll(() => Effect.void) // Silently ignore malformed messages
    );

const extractSpanContext = () =>
  pipe(
    Effect.currentSpan,
    Effect.map((span) => ({
      traceId: span.traceId,
      parentId: span.spanId,
    })),
    Effect.orDie
  );

const encodeProtocolCommand = (
  command: ReadonlyDeep<WireCommand>,
  context: { readonly traceId: string; readonly parentId: string }
): ProtocolCommand => ({
  type: 'command' as const,
  id: command.id,
  target: command.target,
  name: command.name,
  payload: command.payload,
  context,
});

const cleanupPendingCommand = (stateRef: Ref.Ref<ProtocolState>, commandId: string) =>
  Ref.update(stateRef, (state) => ({
    ...state,
    pendingCommands: HashMap.remove(state.pendingCommands, commandId),
  }));

const registerPendingCommand = (
  stateRef: Ref.Ref<ProtocolState>,
  commandId: string,
  deferred: Deferred.Deferred<CommandResult>
) =>
  pipe(
    Ref.update(stateRef, (state) => ({
      ...state,
      pendingCommands: HashMap.set(state.pendingCommands, commandId, deferred),
    })),
    Effect.as(deferred)
  );

const encodeAndPublishCommand = (
  transport: ReadonlyDeep<Client.Transport>,
  command: ReadonlyDeep<WireCommand>,
  timestamp: ReadonlyDeep<Date>
) =>
  pipe(
    extractSpanContext(),
    Effect.flatMap((context) => {
      const wireMessage = encodeProtocolCommand(command, context);
      return transport.publish(
        makeTransportMessage(command.id, 'command', JSON.stringify(wireMessage), {
          timestamp: timestamp.toISOString(),
        })
      );
    }),
    Effect.withSpan(`eventsourcing.Protocol/${command.name}`, {
      kind: 'client',
      attributes: {
        'rpc.system': 'eventsourcing',
        'rpc.service': 'eventsourcing.Protocol',
        'rpc.method': command.name,
        'messaging.message.id': command.id,
        'messaging.destination.name': command.target,
      },
    })
  );

const publishCommandToTransport = (
  transport: ReadonlyDeep<Client.Transport>,
  command: ReadonlyDeep<WireCommand>
) =>
  pipe(
    currentTimestamp(),
    Effect.flatMap((timestamp) => encodeAndPublishCommand(transport, command, timestamp))
  );

const awaitCommandResultWithTimeout = (
  deferred: Deferred.Deferred<CommandResult>,
  commandId: string
) =>
  pipe(
    deferred,
    Deferred.await,
    Effect.timeout(Duration.seconds(10)),
    Effect.catchTag('TimeoutException', () =>
      Effect.fail(
        new ProtocolCommandTimeoutError({
          commandId,
          timeoutMs: 10000,
        })
      )
    )
  );

const executeWireCommand =
  (
    stateRef: Ref.Ref<ProtocolState>,
    transport: ReadonlyDeep<Client.Transport>,
    command: ReadonlyDeep<WireCommand>
  ) =>
  (deferred: Deferred.Deferred<CommandResult>) =>
    pipe(
      Effect.acquireRelease(registerPendingCommand(stateRef, command.id, deferred), () =>
        cleanupPendingCommand(stateRef, command.id)
      ),
      Effect.andThen(publishCommandToTransport(transport, command)),
      Effect.andThen(awaitCommandResultWithTimeout(deferred, command.id))
    );

const createWireCommandSender =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (command: ReadonlyDeep<WireCommand>) =>
    pipe(
      Deferred.make<CommandResult>(),
      Effect.flatMap(executeWireCommand(stateRef, transport, command))
    );

const encodeProtocolSubscribe = (
  streamId: string,
  context: { readonly traceId: string; readonly parentId: string }
): ProtocolSubscribe => ({
  type: 'subscribe' as const,
  streamId,
  context,
});

const cleanupSubscription = (stateRef: Ref.Ref<ProtocolState>, streamId: string) =>
  Ref.update(stateRef, (state) => ({
    ...state,
    subscriptions: HashMap.remove(state.subscriptions, streamId),
  }));

const encodeAndPublishSubscribe = (
  transport: ReadonlyDeep<Client.Transport>,
  streamId: string,
  timestamp: ReadonlyDeep<Date>
) =>
  pipe(
    extractSpanContext(),
    Effect.flatMap((context) => {
      const wireMessage = encodeProtocolSubscribe(streamId, context);
      return transport.publish(
        makeTransportMessage(crypto.randomUUID(), 'subscribe', JSON.stringify(wireMessage), {
          timestamp: timestamp.toISOString(),
        })
      );
    }),
    Effect.withSpan('eventsourcing.Protocol/Subscribe', {
      kind: 'client',
      attributes: {
        'rpc.system': 'eventsourcing',
        'rpc.service': 'eventsourcing.Protocol',
        'rpc.method': 'Subscribe',
        'messaging.destination.name': streamId,
      },
    })
  );

const publishSubscribeMessage = (transport: ReadonlyDeep<Client.Transport>, streamId: string) =>
  pipe(
    currentTimestamp(),
    Effect.flatMap((timestamp) => encodeAndPublishSubscribe(transport, streamId, timestamp))
  );

const createSubscriptionStream = (
  stateRef: Ref.Ref<ProtocolState>,
  streamId: string,
  queue: Queue.Queue<Event>
) =>
  pipe(
    Stream.acquireRelease(Effect.succeed(queue), () => cleanupSubscription(stateRef, streamId)),
    Stream.flatMap(Stream.fromQueue)
  );

const registerSubscriptionAndPublish =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>, streamId: string) =>
  (queue: Queue.Queue<Event>) =>
    pipe(
      Ref.update(stateRef, (state) => ({
        ...state,
        subscriptions: HashMap.set(state.subscriptions, streamId, queue),
      })),
      Effect.andThen(publishSubscribeMessage(transport, streamId)),
      Effect.as(createSubscriptionStream(stateRef, streamId, queue))
    );

const createSubscriber =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (streamId: string) =>
    pipe(
      Queue.unbounded<Event>(),
      Effect.flatMap(registerSubscriptionAndPublish(stateRef, transport, streamId))
    );

const createScopedWireCommandSender =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (command: ReadonlyDeep<WireCommand>) =>
    pipe(command, createWireCommandSender(stateRef, transport), Effect.scoped);

const startMessageHandler =
  (stateRef: Ref.Ref<ProtocolState>, transport: ReadonlyDeep<Client.Transport>) =>
  (stream: Stream.Stream<ReadonlyDeep<TransportMessage>, TransportError, never>) =>
    pipe(
      stream,
      (s) => Stream.runForEach(s, handleMessage(stateRef)),
      Effect.forkScoped,
      Effect.as({
        sendWireCommand: createScopedWireCommandSender(stateRef, transport),
        subscribe: createSubscriber(stateRef, transport),
      })
    );

const initializeProtocol =
  (transport: ReadonlyDeep<Client.Transport>) => (stateRef: Ref.Ref<ProtocolState>) =>
    pipe(transport.subscribe(), Effect.flatMap(startMessageHandler(stateRef, transport)));

const createProtocolService = (
  transport: ReadonlyDeep<Client.Transport>
): Effect.Effect<Context.Tag.Service<typeof Protocol>, TransportError, Scope.Scope> =>
  pipe(
    {
      pendingCommands: HashMap.empty(),
      subscriptions: HashMap.empty(),
    },
    Ref.make<ProtocolState>,
    Effect.flatMap(initializeProtocol(transport))
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
