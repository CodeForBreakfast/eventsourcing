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
} from 'effect';
import type {
  EventStreamId,
  EventStreamPosition,
  EventNumber,
} from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Event Sourcing Specific Types - The only custom logic we need
// ============================================================================

export interface StreamEvent<T> {
  readonly streamId: EventStreamId;
  readonly eventNumber: EventNumber;
  readonly position: EventStreamPosition;
  readonly event: T;
  readonly timestamp: Date;
}

export interface AggregateCommand<T = unknown> {
  readonly aggregateId: string;
  readonly aggregateName: string;
  readonly commandName: string;
  readonly payload: T;
  readonly metadata?: Record<string, unknown>;
}

export interface CommandResult<T = unknown> {
  readonly success: boolean;
  readonly result?: T;
  readonly error?: string;
  readonly position?: EventStreamPosition;
}

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
    result: Schema.Unknown,
  })
);

type ProtocolMessage = Schema.Schema.Type<typeof ProtocolMessage>;

// ============================================================================
// Event Transport Interface
// ============================================================================

export interface EventTransport<TEvent> {
  readonly subscribe: (
    streamId: EventStreamId,
    position?: EventStreamPosition
  ) => Effect.Effect<Stream.Stream<StreamEvent<TEvent>, never, never>, never, never>;
  readonly sendCommand: <TPayload, TResult>(
    command: AggregateCommand<TPayload>
  ) => Effect.Effect<CommandResult<TResult>, never, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

/**
 * Service tag for EventTransport.
 * Allows clients to depend on the transport abstraction without knowing
 * whether it's WebSocket, HTTP, or any other implementation.
 */
export class EventTransportService extends Effect.Tag('@eventsourcing/EventTransport')<
  EventTransportService,
  EventTransport<unknown>
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

const waitForConnection = (ws: WebSocket): Effect.Effect<void, Error> =>
  Effect.async<void, Error>((resume) => {
    if (ws.readyState === WebSocket.OPEN) {
      resume(Effect.succeed(void 0));
    } else {
      ws.onopen = () => resume(Effect.succeed(void 0));
      ws.onerror = (error) =>
        resume(Effect.fail(new Error(`WebSocket connection failed: ${error}`)));
    }
  });

const sendMessage = (ws: WebSocket) => (message: unknown) =>
  Effect.sync(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket is not connected');
    }
  });

const processEventMessage =
  <TEvent>(eventSchema: Schema.Schema<TEvent>, eventPubSub: PubSub.PubSub<StreamEvent<TEvent>>) =>
  (msg: Extract<ProtocolMessage, { type: 'event' }>) =>
    pipe(
      Schema.decode(eventSchema)(msg.event as TEvent),
      Effect.map((event) => ({
        streamId: msg.streamId as EventStreamId,
        eventNumber: msg.eventNumber as unknown as EventNumber,
        position: msg.position as unknown as EventStreamPosition,
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
          onNone: () => Effect.void,
          onSome: (queue) => Queue.offer(queue, msg.result as CommandResult),
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
                Effect.catchAll((error) => Effect.logError(`Failed to process message: ${error}`))
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
  (streamId: EventStreamId, position?: EventStreamPosition) =>
    pipe(
      Ref.get(subscriptions),
      Effect.flatMap((subs) =>
        HashMap.has(subs, streamId)
          ? Effect.void
          : pipe(
              sendMessage(ws)({
                type: 'subscribe',
                streamId,
                position,
              }),
              Effect.zipRight(Ref.update(subscriptions, HashMap.set(streamId, true)))
            )
      ),
      Effect.map(() =>
        pipe(
          Stream.fromPubSub(eventPubSub),
          Stream.filter((event) => event.streamId === streamId)
        )
      )
    );

const sendCommand =
  (
    ws: WebSocket,
    pendingCommands: Ref.Ref<HashMap.HashMap<string, Queue.Queue<CommandResult<unknown>>>>
  ) =>
  <TPayload, TResult>(command: AggregateCommand<TPayload>) =>
    pipe(
      Effect.all({
        id: Effect.sync(() => crypto.randomUUID() as string),
        resultQueue: Queue.unbounded<CommandResult<TResult>>(),
      }),
      Effect.tap(({ id, resultQueue }) =>
        Ref.update(
          pendingCommands,
          HashMap.set(id, resultQueue as Queue.Queue<CommandResult<unknown>>)
        )
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
          Effect.tap(() => Ref.update(pendingCommands, HashMap.remove(id as string))),
          Effect.map((result) => result as CommandResult<TResult>)
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
 * Creates a WebSocket event transport for event sourcing.
 * Returns an EventTransport implementation that clients can use without
 * knowing about the underlying WebSocket details.
 */
export const makeEventTransport = <TEvent>(
  url: string,
  eventSchema: Schema.Schema<TEvent>
): Effect.Effect<EventTransport<TEvent>, never, Scope.Scope> =>
  pipe(
    createWebSocket(url),
    Effect.tap((ws) => waitForConnection(ws).pipe(Effect.orDie)),
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
          subscribe: subscribe(ws, subscriptions, eventPubSub),
          sendCommand: sendCommand(ws, pendingCommands),
          disconnect: disconnect(ws, subscriptions),
        }))
      )
    ),
    Effect.scoped // Automatic cleanup on scope exit
  );

/**
 * Creates a Layer that provides EventTransportService with WebSocket implementation.
 * This allows clients to use the transport via dependency injection without
 * knowing about the WebSocket implementation details.
 */
export const EventTransportLive = (url: string, eventSchema: Schema.Schema<unknown>) =>
  Layer.scoped(EventTransportService, makeEventTransport(url, eventSchema));
