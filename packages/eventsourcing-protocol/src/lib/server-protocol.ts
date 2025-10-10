import {
  Context,
  Stream,
  Data,
  Layer,
  Queue,
  Ref,
  HashMap,
  pipe,
  Option,
  Match,
  Scope,
  Clock,
  Effect,
  Schema,
} from 'effect';
import { type ReadonlyDeep } from 'type-fest';
import {
  makeTransportMessage,
  type TransportError,
  type TransportMessage,
  type Server,
} from '@codeforbreakfast/eventsourcing-transport';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import {
  Event,
  ProtocolCommand,
  ProtocolCommandResult,
  ProtocolEvent,
  ProtocolSubscribe,
  ProtocolServerIncoming,
  ProtocolValidationError,
} from './protocol';

// ============================================================================
// Server Protocol Errors
// ============================================================================

export class ServerProtocolError extends Data.TaggedError('ServerProtocolError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/**
 * Service tag for Server Protocol.
 * Handles commands, command results, and event publishing for server-side protocol operations.
 */
export class ServerProtocol extends Context.Tag('ServerProtocol')<
  ServerProtocol,
  {
    readonly onWireCommand: Stream.Stream<WireCommand, never, never>;
    readonly sendResult: (
      commandId: string,
      result: ReadonlyDeep<CommandResult>
    ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
    readonly publishEvent: (
      event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>
    ) => Effect.Effect<void, TransportError | ServerProtocolError, never>;
  }
>() {}

// ============================================================================
// Server State Management
// ============================================================================

interface ServerState {
  readonly subscriptions: HashMap.HashMap<string, readonly string[]>;
}

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

const validateServerIncomingMessage = (rawPayload: unknown) =>
  pipe(
    rawPayload,
    Schema.decodeUnknown(ProtocolServerIncoming),
    Effect.mapError(
      (cause) =>
        new ProtocolValidationError({
          message: 'Invalid server incoming message format',
          rawData: rawPayload,
          cause,
        })
    )
  );

const currentTimestamp = () =>
  pipe(
    Clock.currentTimeMillis,
    Effect.map((millis) => new Date(millis))
  );

const handleProtocolCommand =
  (commandQueue: Queue.Queue<WireCommand>) => (wireMessage: ReadonlyDeep<ProtocolCommand>) =>
    Queue.offer(commandQueue, {
      id: wireMessage.id,
      target: wireMessage.target,
      name: wireMessage.name,
      payload: wireMessage.payload,
    });

const updateSubscriptions = (state: ServerState, streamId: string, connectionId: string) =>
  pipe(
    HashMap.get(state.subscriptions, streamId),
    Option.match({
      onNone: () => HashMap.set(state.subscriptions, streamId, [connectionId]),
      onSome: (existing) => HashMap.set(state.subscriptions, streamId, [...existing, connectionId]),
    })
  );

const handleProtocolSubscribe =
  (stateRef: Ref.Ref<ServerState>, connectionId: string) =>
  (wireMessage: ReadonlyDeep<ProtocolSubscribe>) =>
    pipe(
      Ref.update(stateRef, (state) => ({
        ...state,
        subscriptions: updateSubscriptions(state, wireMessage.streamId, connectionId),
      }))
    );

const routeParsedMessage =
  (commandQueue: Queue.Queue<WireCommand>, stateRef: Ref.Ref<ServerState>, connectionId: string) =>
  (parsedMessage: ReadonlyDeep<ProtocolServerIncoming>) =>
    pipe(
      parsedMessage,
      Match.value,
      Match.when({ type: 'command' }, handleProtocolCommand(commandQueue)),
      Match.when({ type: 'subscribe' }, handleProtocolSubscribe(stateRef, connectionId)),
      Match.orElse(() => Effect.void)
    );

const processIncomingMessage =
  (commandQueue: Queue.Queue<WireCommand>, stateRef: Ref.Ref<ServerState>, connectionId: string) =>
  (message: ReadonlyDeep<TransportMessage>) =>
    pipe(
      message,
      parseTransportPayload,
      Effect.flatMap(validateServerIncomingMessage),
      Effect.flatMap(routeParsedMessage(commandQueue, stateRef, connectionId)),
      Effect.catchAll(() => Effect.void)
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

const createResultMessageWithContext = (
  commandId: string,
  result: ReadonlyDeep<CommandResult>,
  context: { readonly traceId: string; readonly parentId: string }
): ProtocolCommandResult =>
  pipe(
    result,
    Match.value,
    Match.tag('Success', (res) => ({
      type: 'command_result' as const,
      commandId,
      success: true,
      position: res.position,
      context,
    })),
    Match.tag('Failure', (res) => ({
      type: 'command_result' as const,
      commandId,
      success: false,
      error: JSON.stringify(res.error),
      context,
    })),
    Match.exhaustive
  );

const buildAndBroadcastResult = (
  server: ReadonlyDeep<Server.Transport>,
  commandId: string,
  result: ReadonlyDeep<CommandResult>,
  timestamp: ReadonlyDeep<Date>
) =>
  pipe(
    extractSpanContext(),
    Effect.flatMap((context) => {
      const resultMessage = createResultMessageWithContext(commandId, result, context);
      return server.broadcast(
        makeTransportMessage(commandId, 'command_result', JSON.stringify(resultMessage), {
          timestamp: timestamp.toISOString(),
        })
      );
    }),
    Effect.withSpan('eventsourcing.Protocol/SendResult', {
      kind: 'server',
      attributes: {
        'rpc.system': 'eventsourcing',
        'rpc.service': 'eventsourcing.Protocol',
        'rpc.method': 'SendResult',
        'messaging.message.id': commandId,
      },
    })
  );

const createResultSender =
  (server: ReadonlyDeep<Server.Transport>) =>
  (
    commandId: string,

    result: ReadonlyDeep<CommandResult>
  ) =>
    pipe(
      currentTimestamp(),
      Effect.flatMap((timestamp) => buildAndBroadcastResult(server, commandId, result, timestamp))
    );

const buildAndBroadcastEvent = (
  server: ReadonlyDeep<Server.Transport>,
  event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>,
  timestamp: ReadonlyDeep<Date>,
  context: { readonly traceId: string; readonly parentId: string },
  messageId: string
) => {
  const eventMessage: ProtocolEvent = {
    type: 'event',
    streamId: String(event.streamId),
    position: event.position,
    eventType: event.type,
    data: event.data,
    timestamp: event.timestamp,
    context,
  };

  return server.broadcast(
    makeTransportMessage(messageId, 'event', JSON.stringify(eventMessage), {
      timestamp: timestamp.toISOString(),
    })
  );
};

const broadcastEventWithContext = (
  server: ReadonlyDeep<Server.Transport>,
  event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>,
  timestamp: ReadonlyDeep<Date>
) => {
  const messageId = crypto.randomUUID();
  return pipe(
    extractSpanContext(),
    Effect.flatMap((context) =>
      buildAndBroadcastEvent(server, event, timestamp, context, messageId)
    ),
    Effect.withSpan(`publish ${String(event.streamId)}`, {
      kind: 'producer',
      attributes: {
        'messaging.system': 'eventsourcing',
        'messaging.operation.name': 'publish',
        'messaging.destination.name': String(event.streamId),
        'messaging.message.id': messageId,
        'eventsourcing.event.type': event.type,
        'eventsourcing.event.position': String(event.position),
      },
    })
  );
};

const broadcastEventMessage = (
  server: ReadonlyDeep<Server.Transport>,
  event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>
) =>
  pipe(
    currentTimestamp(),
    Effect.flatMap((timestamp) => broadcastEventWithContext(server, event, timestamp))
  );

const matchSubscribedConnections =
  (
    server: ReadonlyDeep<Server.Transport>,
    event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>
  ) =>
  (state: ServerState) =>
    pipe(
      HashMap.get(state.subscriptions, String(event.streamId)),
      Option.match({
        onNone: () => Effect.void,
        onSome: (_connectionIds) => broadcastEventMessage(server, event),
      })
    );

const createEventPublisher =
  (server: ReadonlyDeep<Server.Transport>, stateRef: Ref.Ref<ServerState>) =>
  (event: ReadonlyDeep<Event & { readonly streamId: EventStreamId }>) =>
    pipe(stateRef, Ref.get, Effect.flatMap(matchSubscribedConnections(server, event)));

const processConnectionMessages =
  (commandQueue: Queue.Queue<WireCommand>, stateRef: Ref.Ref<ServerState>) =>
  (connection: Server.ClientConnection) =>
    pipe(
      connection.transport.subscribe(),
      Effect.flatMap((messageStream) =>
        Effect.forkScoped(
          Stream.runForEach(
            messageStream,
            processIncomingMessage(commandQueue, stateRef, connection.clientId)
          )
        )
      ),
      Effect.andThen(
        Effect.addFinalizer(() =>
          Ref.update(stateRef, (state) => ({
            ...state,
            subscriptions: HashMap.map(state.subscriptions, (connectionIds) =>
              connectionIds.filter((id) => id !== connection.clientId)
            ),
          }))
        )
      )
    );

const startConnectionHandler = (
  server: ReadonlyDeep<Server.Transport>,
  commandQueue: Queue.Queue<WireCommand>,
  stateRef: Ref.Ref<ServerState>
) =>
  pipe(
    server.connections,
    Stream.runForEach(processConnectionMessages(commandQueue, stateRef)),
    Effect.forkScoped,
    Effect.as({
      onWireCommand: Stream.fromQueue(commandQueue),
      sendResult: createResultSender(server),
      publishEvent: createEventPublisher(server, stateRef),
    })
  );

const createServerProtocolService = (
  server: ReadonlyDeep<Server.Transport>
): Effect.Effect<Context.Tag.Service<typeof ServerProtocol>, TransportError, Scope.Scope> =>
  pipe(
    [
      Queue.unbounded<WireCommand>(),
      Ref.make<ServerState>({ subscriptions: HashMap.empty() }),
    ] as const,
    Effect.all,
    Effect.flatMap(([commandQueue, stateRef]) =>
      startConnectionHandler(server, commandQueue, stateRef)
    )
  );

// ============================================================================
// Live Implementation
// ============================================================================

export const ServerProtocolLive = (server: ReadonlyDeep<Server.Transport>) =>
  Layer.scoped(ServerProtocol, createServerProtocolService(server));
