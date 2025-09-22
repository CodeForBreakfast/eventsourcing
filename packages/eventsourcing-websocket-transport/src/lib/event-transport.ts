/**
 * WebSocket Event Transport using Effect primitives
 */

import {
  Effect,
  Stream,
  PubSub,
  Schema,
  Ref,
  pipe,
  HashMap,
  Option,
  Queue,
  Fiber,
  Scope,
  Layer,
  Either,
  Data,
} from 'effect';
import {
  type EventStreamId,
  type EventStreamPosition,
  EventStreamPosition as EventStreamPositionSchema,
  WebSocketError,
  webSocketError,
} from '@codeforbreakfast/eventsourcing-store';
import {
  type StreamEvent,
  type Aggregate,
  type AggregateCommand,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';

// ============================================================================
// Error Types - Using Data.TaggedError for proper Effect error handling
// ============================================================================

export class TransportError extends Data.TaggedError('TransportError')<{
  readonly message: string;
}> {}

export class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string;
  readonly aggregate?: Aggregate;
  readonly commandName?: string;
}> {}

export class MessageParseError extends Data.TaggedError('MessageParseError')<{
  readonly message: string;
  readonly rawData?: unknown;
}> {}

// Use Either for command results - success returns position, failure returns error
export type CommandResult = Either.Either<EventStreamPosition, CommandError>;

// ============================================================================
// Protocol Messages - Event sourcing protocol over WebSocket
// ============================================================================

export const ProtocolMessage = Schema.Union(
  // Client -> Server
  Schema.Struct({
    type: Schema.Literal('subscribe'),
    streamId: Schema.String,
    position: Schema.optional(Schema.Number),
  }),
  Schema.Struct({
    type: Schema.Literal('unsubscribe'),
    streamId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('command'),
    id: Schema.String,
    command: Schema.Unknown,
  }),
  // Server -> Client
  Schema.Struct({
    type: Schema.Literal('event'),
    streamId: Schema.String,
    eventNumber: Schema.Number,
    position: Schema.Number,
    event: Schema.Unknown,
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('command_result'),
    id: Schema.String,
    success: Schema.Boolean,
    position: Schema.optional(Schema.Unknown),
    error: Schema.optional(Schema.String),
  })
);

type ProtocolMessage = Schema.Schema.Type<typeof ProtocolMessage>;

// ============================================================================
// Event Transport Interface - Functional Design with Type Safety
// ============================================================================

/**
 * A connected transport that can perform operations.
 * This type can ONLY exist after a successful connection.
 */
export interface ConnectedTransport<TEvent> {
  readonly subscribe: (
    position: EventStreamPosition
  ) => Effect.Effect<Stream.Stream<StreamEvent<TEvent>, never, never>, never, never>;
  readonly sendCommand: <TPayload>(
    command: AggregateCommand<TPayload>
  ) => Effect.Effect<CommandResult, never, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

/**
 * Transport connector function - the only way to get a ConnectedTransport.
 * This design makes it impossible to call transport methods before connecting.
 */
export interface TransportConnector<TEvent> {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<TEvent>, WebSocketError, Scope.Scope>;
}

/**
 * Service interface for EventTransportService.
 * Provides a connect function instead of a pre-built transport.
 */
export interface EventTransportConnectorInterface {
  readonly connect: (
    url: string
  ) => Effect.Effect<ConnectedTransport<unknown>, WebSocketError, Scope.Scope>;
}

/**
 * Service tag for EventTransportConnector.
 * Clients must explicitly connect before they can use the transport.
 */
export class EventTransportConnector extends Effect.Tag('@eventsourcing/EventTransportConnector')<
  EventTransportConnector,
  EventTransportConnectorInterface
>() {}

/**
 * Legacy service interface that provides pre-connected transport for backward compatibility.
 * This is primarily for testing and simple use cases.
 * For production code, prefer using EventTransportConnector.
 */
export class EventTransportService extends Effect.Tag('@eventsourcing/EventTransport')<
  EventTransportService,
  ConnectedTransport<unknown>
>() {}

// ============================================================================
// WebSocket Event Transport Implementation
// ============================================================================

const createWebSocket = (url: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new WebSocket(url)),
    (socket) =>
      Effect.sync(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      })
  );

const waitForConnection = (ws: WebSocket, url: string): Effect.Effect<void, WebSocketError> =>
  Effect.async<void, WebSocketError>((resume) => {
    if (ws.readyState === WebSocket.OPEN) {
      resume(Effect.succeed(void 0));
    } else {
      ws.onopen = () => resume(Effect.succeed(void 0));
      ws.onerror = (error) =>
        resume(
          Effect.fail(
            webSocketError.connect(url, `WebSocket connection failed: ${error}`, undefined, error)
          )
        );
    }
  });

const sendMessage =
  (ws: WebSocket) =>
  (message: unknown): Effect.Effect<void, TransportError> =>
    pipe(
      Effect.try({
        try: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
          } else {
            throw new TransportError({ message: 'WebSocket is not connected' });
          }
        },
        catch: (error: unknown) => {
          if (error instanceof TransportError) {
            return error;
          }
          return new TransportError({ message: String(error) });
        },
      })
    );

const processEventMessage =
  <TEvent>(eventSchema: Schema.Schema<TEvent>, eventPubSub: PubSub.PubSub<StreamEvent<TEvent>>) =>
  (msg: Extract<ProtocolMessage, { type: 'event' }>) =>
    pipe(
      Effect.all({
        event: Schema.decodeUnknown(eventSchema)(msg.event),
        position: Schema.decodeUnknown(EventStreamPositionSchema)({
          streamId: msg.streamId,
          eventNumber: msg.eventNumber,
        }),
      }),
      Effect.map(({ event, position }) => ({
        position,
        event,
        timestamp: new Date(msg.timestamp),
      })),
      Effect.flatMap((streamEvent) => PubSub.publish(eventPubSub, streamEvent))
    );

const processCommandResult =
  (pendingCommands: Ref.Ref<HashMap.HashMap<string, Queue.Queue<CommandResult>>>) =>
  (msg: Extract<ProtocolMessage, { type: 'command_result' }>) =>
    pipe(
      Ref.get(pendingCommands),
      Effect.map((commands) => HashMap.get(commands, msg.id)),
      Effect.flatMap((queueOption) =>
        Option.match(queueOption, {
          onNone: () => Effect.void as Effect.Effect<void, never, never>,
          onSome: (queue) => {
            if (msg.success && msg.position) {
              return pipe(
                Schema.decodeUnknown(EventStreamPositionSchema)(msg.position),
                Effect.map((position) => Either.right(position) as CommandResult),
                Effect.flatMap((result) => Queue.offer(queue, result)),
                Effect.catchAll(() =>
                  // If position decode fails, treat as command error
                  Queue.offer(
                    queue,
                    Either.left(new CommandError({ message: 'Invalid command result position' }))
                  )
                )
              );
            } else {
              // Command failed
              return Queue.offer(
                queue,
                Either.left(new CommandError({ message: msg.error || 'Command failed' }))
              );
            }
          },
        })
      )
    );

const processMessage =
  <TEvent>(
    eventSchema: Schema.Schema<TEvent>,
    eventPubSub: PubSub.PubSub<StreamEvent<TEvent>>,
    pendingCommands: Ref.Ref<HashMap.HashMap<string, Queue.Queue<CommandResult>>>
  ) =>
  (msg: ProtocolMessage) => {
    switch (msg.type) {
      case 'event':
        return processEventMessage(eventSchema, eventPubSub)(msg);
      case 'command_result':
        return processCommandResult(pendingCommands)(msg);
      default:
        return Effect.void;
    }
  };

const startMessageProcessor = <TEvent>(
  ws: WebSocket,
  eventSchema: Schema.Schema<TEvent>,
  eventPubSub: PubSub.PubSub<StreamEvent<TEvent>>,
  pendingCommands: Ref.Ref<HashMap.HashMap<string, Queue.Queue<CommandResult>>>
) =>
  Effect.async<Fiber.RuntimeFiber<never, never>>((resume) => {
    const fiber = Effect.runFork(
      Effect.forever(
        Effect.async<void>((messageResume) => {
          ws.onmessage = (event) => {
            Effect.runPromise(
              pipe(
                Effect.try(() => JSON.parse(event.data as string)),
                Effect.flatMap(Schema.decode(ProtocolMessage)),
                Effect.flatMap(processMessage(eventSchema, eventPubSub, pendingCommands)),
                Effect.catchAll((error) => Effect.logError(`Failed to process message: ${error}`)),
                Effect.asVoid
              )
            ).then(() => messageResume(Effect.succeed(void 0)));
          };
        })
      )
    );
    resume(Effect.succeed(fiber));
  });

const subscribe =
  (
    ws: WebSocket,
    subscriptions: Ref.Ref<HashMap.HashMap<EventStreamId, boolean>>,
    eventPubSub: PubSub.PubSub<StreamEvent<any>>
  ) =>
  (position: EventStreamPosition) =>
    pipe(
      Ref.get(subscriptions),
      Effect.flatMap((subs) =>
        HashMap.has(subs, position.streamId)
          ? Effect.void
          : pipe(
              sendMessage(ws)({
                type: 'subscribe',
                streamId: position.streamId,
                position: position.eventNumber,
              }),
              Effect.zipRight(Ref.update(subscriptions, HashMap.set(position.streamId, true)))
            )
      ),
      Effect.map(() =>
        pipe(
          Stream.fromPubSub(eventPubSub),
          Stream.filter((event) => event.position.streamId === position.streamId)
        )
      )
    );

const sendCommand =
  (ws: WebSocket, pendingCommands: Ref.Ref<HashMap.HashMap<string, Queue.Queue<CommandResult>>>) =>
  <TPayload>(command: AggregateCommand<TPayload>) =>
    pipe(
      Effect.all({
        id: Effect.sync(() => crypto.randomUUID() as string),
        resultQueue: Queue.unbounded<CommandResult>(),
      }),
      Effect.tap(({ id, resultQueue }) =>
        Ref.update(pendingCommands, HashMap.set(id, resultQueue))
      ),
      Effect.tap(({ id }) =>
        sendMessage(ws)({
          type: 'command',
          id,
          command,
        })
      ),
      Effect.flatMap(({ id, resultQueue }) =>
        pipe(
          Queue.take(resultQueue),
          Effect.tap(() => Ref.update(pendingCommands, HashMap.remove(id as string)))
        )
      )
    );

const disconnect =
  (ws: WebSocket, subscriptions: Ref.Ref<HashMap.HashMap<EventStreamId, boolean>>) => () =>
    pipe(
      Ref.get(subscriptions),
      Effect.flatMap((subs) =>
        Effect.forEach(HashMap.keys(subs), (streamId) =>
          sendMessage(ws)({
            type: 'unsubscribe',
            streamId,
          })
        )
      ),
      Effect.zipRight(Ref.set(subscriptions, HashMap.empty())),
      Effect.zipRight(
        Effect.sync(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        })
      )
    );

/**
 * Creates a connected WebSocket transport for event sourcing.
 * This is a private function - clients should use `connect` to get a ConnectedTransport.
 */
const createConnectedTransport = <TEvent>(
  url: string,
  eventSchema: Schema.Schema<TEvent>
): Effect.Effect<ConnectedTransport<TEvent>, WebSocketError, Scope.Scope> =>
  pipe(
    createWebSocket(url),
    Effect.tap((ws) => waitForConnection(ws, url)),
    Effect.flatMap((ws) =>
      pipe(
        Effect.all({
          eventPubSub: PubSub.unbounded<StreamEvent<TEvent>>(),
          subscriptions: Ref.make(HashMap.empty<EventStreamId, boolean>()),
          pendingCommands: Ref.make(HashMap.empty<string, Queue.Queue<CommandResult>>()),
        }),
        Effect.tap(({ eventPubSub, pendingCommands }) =>
          startMessageProcessor(ws, eventSchema, eventPubSub, pendingCommands)
        ),
        Effect.map(({ eventPubSub, subscriptions, pendingCommands }) => ({
          subscribe: (position: EventStreamPosition) =>
            pipe(subscribe(ws, subscriptions, eventPubSub)(position), Effect.orDie),
          sendCommand: <TPayload>(command: AggregateCommand<TPayload>) =>
            pipe(sendCommand(ws, pendingCommands)(command), Effect.orDie),
          disconnect: () => pipe(disconnect(ws, subscriptions)(), Effect.orDie),
        }))
      )
    ),
    Effect.scoped // Automatic cleanup on scope exit
  );

/**
 * Creates a transport connector that provides a connect function.
 * The connect function is the ONLY way to get a ConnectedTransport,
 * ensuring that transport methods can't be called before connection.
 */
export const makeTransportConnector = <TEvent>(
  eventSchema: Schema.Schema<TEvent>
): TransportConnector<TEvent> => ({
  connect: (url: string) => createConnectedTransport(url, eventSchema),
});

/**
 * Direct connect function - the functional way to create a connected transport.
 * This is the primary API for the new functional design.
 */
export const connect = <TEvent>(
  url: string,
  eventSchema: Schema.Schema<TEvent>
): Effect.Effect<ConnectedTransport<TEvent>, WebSocketError, Scope.Scope> =>
  createConnectedTransport(url, eventSchema);

/**
 * Creates a Layer that provides EventTransportConnector with WebSocket implementation.
 * Clients must call connect() to get a ConnectedTransport.
 * This is the recommended approach for production code.
 */
export const EventTransportConnectorLive = (eventSchema: Schema.Schema<unknown>) =>
  Layer.succeed(EventTransportConnector, {
    connect: (url: string) => createConnectedTransport(url, eventSchema),
  } as EventTransportConnectorInterface);

/**
 * Creates a Layer that provides EventTransportService with a pre-connected WebSocket transport.
 * This is for backward compatibility and testing.
 * For production code, prefer EventTransportConnectorLive.
 */
export const EventTransportLive = (url: string, eventSchema: Schema.Schema<unknown>) =>
  Layer.scoped(EventTransportService, createConnectedTransport(url, eventSchema));
