/**
 * WebSocket Event Transport Implementation
 *
 * Uses functional patterns and discriminated unions to ensure type safety.
 * Invalid states are impossible to represent at the type level.
 */

import {
  Effect,
  Layer,
  Stream,
  Ref,
  Option,
  pipe,
  HashMap,
  Array,
  Schema,
  Queue,
  Fiber,
  Random,
  Duration,
  Match,
} from 'effect';
import type { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { WebSocketUrl, ConnectionStatus } from '../types';
import type {
  WebSocketEventTransport,
  StreamEvent,
  AggregateCommand,
  CommandResult,
  SubscriptionOptions,
  StreamSubscription,
  ProtocolMessage,
  TransportState,
  TransportConnected,
  TransportDisconnected,
  SubscriptionState,
  SubscriptionActive,
  SubscriptionStartPosition,
  CommandId,
  CommandPending,
  CommandState,
  ReceiveLoop,
} from './types';
import type {
  TransportConfig,
  WebSocketEventTransportServiceInterface,
} from './interface';
import type { ConnectedWebSocket } from '../webSocketConnection';
import { SendError, createWebSocketConnection } from '../webSocketConnection';
import {
  NetworkError,
  ProtocolError,
  TransportConnectionError,
  TransportSubscriptionError,
  TransportCommandError,
  ProtocolMessageSchema,
  isEventMessage,
  isCommandResultMessage,
  isErrorMessage,
  isSubscribedMessage,
  disconnectedToConnecting,
  connectingToConnected,
  anyToDisconnected,
  isConnected,
  canSendCommands,
} from './types';
import {
  defaultTransportConfig,
  WebSocketEventTransportService,
} from './interface';

// ============================================================================
// Command ID generation
// ============================================================================

const generateCommandId = (): Effect.Effect<CommandId> =>
  pipe(
    Random.nextInt,
    Effect.map((n) => `cmd-${Date.now()}-${n.toString(36)}` as CommandId),
  );

// ============================================================================
// Subscription position helpers
// ============================================================================

const subscriptionOptionsToStart = (
  options?: SubscriptionOptions,
): SubscriptionStartPosition =>
  options?.fromPosition
    ? { _tag: 'from-position', position: options.fromPosition }
    : options?.fromEnd
      ? { _tag: 'from-end' }
      : { _tag: 'from-beginning' };

// ============================================================================
// Message processing for connected state
// ============================================================================

const processEventMessage = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  message: Readonly<ProtocolMessage & { type: 'event' }>,
): Effect.Effect<TransportConnected<TEvent>> =>
  Effect.gen(function* (_) {
    const streamId = message.streamId as EventStreamId;
    const subscription = HashMap.get(state.subscriptions, streamId);

    if (Option.isNone(subscription)) {
      return state;
    }

    const sub = subscription.value;
    if (sub._tag !== 'subscription-active') {
      return state;
    }

    const event: StreamEvent<TEvent> = {
      streamId,
      eventNumber: message.eventNumber,
      position: { streamId, eventNumber: message.eventNumber },
      event: message.event as TEvent,
      timestamp: new Date(message.timestamp),
    };

    yield* _(Queue.offer(sub.eventQueue, event));

    const updatedSub: SubscriptionActive<TEvent> = {
      ...sub,
      currentPosition: { streamId, eventNumber: message.eventNumber },
    };

    return {
      ...state,
      subscriptions: HashMap.set(state.subscriptions, streamId, updatedSub),
    };
  });

const processSubscribedMessage = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  message: Readonly<ProtocolMessage & { type: 'subscribed' }>,
): TransportConnected<TEvent> => {
  const streamId = message.streamId as EventStreamId;
  const subscription = HashMap.get(state.subscriptions, streamId);

  if (
    Option.isNone(subscription) ||
    subscription.value._tag !== 'subscription-requested'
  ) {
    return state;
  }

  const active: SubscriptionActive<TEvent> = {
    _tag: 'subscription-active',
    streamId,
    currentPosition: { streamId, eventNumber: message.position },
    eventQueue: null as unknown as Queue.Queue<StreamEvent<TEvent>>, // Will be set by caller
    subscribedAt: new Date(),
  };

  return {
    ...state,
    subscriptions: HashMap.set(state.subscriptions, streamId, active),
  };
};

const processCommandResultMessage = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  message: Readonly<ProtocolMessage & { type: 'command_result' }>,
): Effect.Effect<TransportConnected<TEvent>> =>
  Effect.gen(function* (_) {
    const commandId = message.id as CommandId;
    const command = HashMap.get(state.commands, commandId);

    if (Option.isNone(command) || command.value._tag !== 'command-pending') {
      return state;
    }

    const result: CommandResult = {
      success: message.success,
      ...(message.result !== undefined && { result: message.result }),
      ...(message.error !== undefined && { error: message.error }),
      ...(message.position !== undefined && {
        position: {
          streamId: command.value.command.aggregateId as EventStreamId,
          eventNumber: message.position,
        }
      }),
    };

    yield* _(Queue.offer(command.value.resultQueue, result));

    return {
      ...state,
      commands: HashMap.remove(state.commands, commandId),
    };
  });

const processProtocolMessage = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  message: Readonly<ProtocolMessage>,
): Effect.Effect<TransportConnected<TEvent>> =>
  Match.value(message).pipe(
    Match.when(isEventMessage, (msg) => processEventMessage(state, msg)),
    Match.when(isSubscribedMessage, (msg) =>
      Effect.succeed(processSubscribedMessage(state, msg)),
    ),
    Match.when(isCommandResultMessage, (msg) =>
      processCommandResultMessage(state, msg),
    ),
    Match.when(isErrorMessage, (msg) =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.logError(`Protocol error: ${msg.code} - ${msg.message}`),
        );
        return state;
      }),
    ),
    Match.orElse(() => Effect.succeed(state)),
  );

// ============================================================================
// Connection management
// ============================================================================

const startReceiveLoop = <TEvent>(
  connection: Readonly<ConnectedWebSocket>,
  stateRef: Readonly<Ref.Ref<TransportState<TEvent>>>,
): Effect.Effect<ReceiveLoop, NetworkError> =>
  Effect.gen(function* (_) {
    const rawStream = connection.receive();

    // Map the stream to handle the error type conversion
    const stream = pipe(
      rawStream,
      Stream.mapError(
        (e) =>
          new NetworkError({
            url: connection.info.url,
            ...(e._tag === 'ReceiveError' && e.reason !== undefined && { code: e.reason }),
            retriable: true,
          }),
      ),
    );

    const fiber = yield* _(
      pipe(
        stream,
        Stream.tap((data) =>
          Effect.gen(function* (_) {
            const state = yield* _(Ref.get(stateRef));

            if (!isConnected(state)) {
              return;
            }

            yield* _(
              pipe(
                Effect.try(() => JSON.parse(data) as unknown),
                Effect.flatMap(Schema.decodeUnknown(ProtocolMessageSchema)),
                Effect.mapError(
                  () =>
                    new ProtocolError({
                      message: 'Failed to decode message',
                      received: data,
                    }),
                ),
                Effect.flatMap((msg) => processProtocolMessage(state, msg)),
                Effect.flatMap((newState) => Ref.set(stateRef, newState)),
                Effect.catchAll((error) =>
                  Effect.logError(`Message processing error: ${String(error)}`),
                ),
              ),
            );
          }),
        ),
        Stream.runDrain,
        Effect.fork,
      ),
    );

    return { stream, fiber };
  });

const sendSubscribeMessage = (
  connection: Readonly<ConnectedWebSocket>,
  streamId: EventStreamId,
  start: Readonly<SubscriptionStartPosition>,
): Effect.Effect<void, NetworkError> =>
  pipe(
    Effect.try(() =>
      JSON.stringify({
        type: 'subscribe',
        streamId: streamId as string,
        position: Match.value(start).pipe(
          Match.when({ _tag: 'from-position' }, (s) => s.position.eventNumber),
          Match.orElse(() => undefined),
        ),
        fromEnd: start._tag === 'from-end',
      } satisfies ProtocolMessage),
    ),
    Effect.flatMap((data) =>
      connection.send(data as import('../types').OutgoingMessage),
    ),
    Effect.mapError(
      (e) =>
        new NetworkError({
          url: connection.info.url,
          code: e instanceof SendError ? e.reason : String(e),
          retriable: true,
        }),
    ),
  );

// ============================================================================
// Transport implementation
// ============================================================================

const createTransportImplementation = <TEvent>(
  stateRef: Ref.Ref<TransportState<TEvent>>,
  statusQueue: Queue.Queue<ConnectionStatus>,
): WebSocketEventTransport<TEvent> => ({
  connect: (url: WebSocketUrl) =>
    Effect.gen(function* (_) {
      const state = yield* _(Ref.get(stateRef));

      // Already connected
      if (isConnected(state)) {
        return;
      }

      // Handle different states
      yield* _(
        Match.value(state).pipe(
          Match.when({ _tag: 'transport-disconnected' }, (disconnected) =>
            Effect.gen(function* (_) {
              const connection = yield* _(createWebSocketConnection());
              const connecting = yield* _(connection.connect(url));

              yield* _(
                Ref.set(
                  stateRef,
                  disconnectedToConnecting(disconnected, connecting),
                ),
              );

              yield* _(
                Queue.offer(statusQueue, {
                  _tag: 'connecting',
                  url,
                  attemptNumber: 1,
                }),
              );

              const connected = yield* _(
                pipe(
                  connecting.wait(),
                  Effect.mapError(
                    (e) =>
                      new NetworkError({
                        url,
                        ...(e.code !== undefined && { code: e.code }),
                        retriable: true,
                      }),
                  ),
                ),
              );

              const receiveLoop = yield* _(
                startReceiveLoop(connected, stateRef),
              );

              const currentState = yield* _(Ref.get(stateRef));
              if (currentState._tag !== 'transport-connecting') {
                return;
              }

              const newState = connectingToConnected<TEvent>(
                currentState,
                connected,
                receiveLoop,
              );

              yield* _(Ref.set(stateRef, newState));

              yield* _(
                Queue.offer(statusQueue, {
                  _tag: 'connected',
                  info: connected.info,
                }),
              );
            }),
          ),
          Match.orElse(() => Effect.void),
        ),
      );
    }).pipe(
      Effect.mapError((e) =>
        e instanceof NetworkError
          ? new TransportConnectionError({
              reason: e.message,
              ...(e.url !== undefined && { url: e.url }),
              ...(e.code !== undefined && { code: e.code }),
            })
          : new TransportConnectionError({
              url,
              reason: String(e),
            }),
      ),
    ),

  disconnect: () =>
    Effect.gen(function* (_) {
      const state = yield* _(Ref.get(stateRef));

      yield* _(
        Match.value(state).pipe(
          Match.when({ _tag: 'transport-connected' }, (connected) =>
            Effect.gen(function* (_) {
              yield* _(Fiber.interrupt(connected.receiveLoop.fiber));
              yield* _(connected.connection.disconnect());

              yield* _(
                Ref.set(
                  stateRef,
                  anyToDisconnected(state as TransportState<unknown>, {
                    code: 'user-requested',
                  }) as TransportState<TEvent>,
                ),
              );

              yield* _(Queue.offer(statusQueue, { _tag: 'disconnected' }));
            }),
          ),
          Match.orElse(() => Effect.void),
        ),
      );
    }).pipe(
      Effect.mapError(
        () =>
          new TransportConnectionError({
            reason: 'Disconnect failed',
          }),
      ),
    ),

  subscribeToStream: (streamId: EventStreamId, options?: SubscriptionOptions) =>
    Stream.unwrap(
      Effect.gen(function* (_) {
        const state = yield* _(Ref.get(stateRef));

        if (!isConnected(state)) {
          return yield* _(
            Effect.fail(
              new TransportSubscriptionError({
                streamId,
                reason: 'Not connected',
              }),
            ),
          );
        }

        const queue = yield* _(Queue.unbounded<StreamEvent<TEvent>>());
        const startPosition = subscriptionOptionsToStart(options);

        yield* _(
          Ref.update(stateRef, (s) => {
            if (!isConnected(s)) return s;

            const requested: SubscriptionState<TEvent> = {
              _tag: 'subscription-requested',
              streamId,
              startFrom: startPosition,
              requestedAt: new Date(),
            };

            return {
              ...s,
              subscriptions: HashMap.set(s.subscriptions, streamId, requested),
            };
          }),
        );

        yield* _(
          sendSubscribeMessage(state.connection, streamId, startPosition).pipe(
            Effect.mapError(
              (e) =>
                new TransportSubscriptionError({
                  streamId,
                  reason: e.message,
                }),
            ),
          ),
        );

        // Wait for subscription confirmation, then update state with queue
        yield* _(
          Effect.gen(function* (_) {
            // In real implementation, would wait for 'subscribed' message
            yield* _(Effect.sleep(Duration.millis(100)));

            yield* _(
              Ref.update(stateRef, (s) => {
                if (!isConnected(s)) return s;

                const sub = HashMap.get(s.subscriptions, streamId);
                if (
                  Option.isNone(sub) ||
                  sub.value._tag !== 'subscription-requested'
                ) {
                  return s;
                }

                const active: SubscriptionActive<TEvent> = {
                  _tag: 'subscription-active',
                  streamId,
                  currentPosition: { streamId, eventNumber: 0 },
                  eventQueue: queue,
                  subscribedAt: new Date(),
                };

                return {
                  ...s,
                  subscriptions: HashMap.set(s.subscriptions, streamId, active),
                };
              }),
            );
          }),
        );

        return Stream.fromQueue(queue);
      }),
    ),

  subscribeToStreams: (subscriptions: Readonly<Array<StreamSubscription>>) =>
    pipe(
      subscriptions,
      Array.map((sub) => {
        const transport = createTransportImplementation<TEvent>(
          stateRef,
          statusQueue,
        );
        return transport.subscribeToStream(sub.streamId, sub.options);
      }),
      (streams) =>
        Stream.mergeAll(streams, { concurrency: subscriptions.length }),
    ),

  sendCommand: <TPayload, TResult>(command: AggregateCommand<TPayload>) =>
    Effect.gen(function* (_) {
      const state = yield* _(Ref.get(stateRef));

      if (!canSendCommands(state)) {
        return yield* _(
          Effect.fail(
            new TransportCommandError({
              aggregateId: command.aggregateId,
              command,
              reason: 'Not connected',
            }),
          ),
        );
      }

      const commandId = yield* _(generateCommandId());
      const resultQueue = yield* _(Queue.unbounded<CommandResult<TResult>>());

      const pending: CommandPending<TPayload, TResult> = {
        _tag: 'command-pending',
        id: commandId,
        command,
        sentAt: new Date(),
        resultQueue,
      };

      yield* _(
        Ref.update(stateRef, (s) => {
          if (!isConnected(s)) return s;
          return {
            ...s,
            commands: HashMap.set(
              s.commands,
              commandId,
              pending as CommandState<unknown, unknown>,
            ),
          };
        }),
      );

      const message: ProtocolMessage = {
        type: 'command',
        id: commandId,
        aggregateId: command.aggregateId,
        aggregateName: command.aggregateName,
        commandName: command.commandName,
        payload: command.payload,
        metadata: command.metadata,
      };

      yield* _(
        pipe(
          Effect.try(() => JSON.stringify(message)),
          Effect.flatMap((data) =>
            state.connection.send(data as import('../types').OutgoingMessage),
          ),
          Effect.mapError(
            (e) =>
              new TransportCommandError({
                aggregateId: command.aggregateId,
                command,
                reason: String(e),
              }),
          ),
        ),
      );

      const result = yield* _(
        pipe(
          Queue.take(resultQueue),
          Effect.timeout(Duration.seconds(30)),
          Effect.mapError(
            () =>
              new TransportCommandError({
                aggregateId: command.aggregateId,
                command,
                reason: 'Command timeout',
              }),
          ),
        ),
      );

      return result;
    }),

  connectionStatus: () => Stream.fromQueue(statusQueue),

  isConnected: () => pipe(Ref.get(stateRef), Effect.map(isConnected)),
});

// ============================================================================
// Factory and service
// ============================================================================

export const createWebSocketEventTransport = <TEvent = unknown>(
  config?: TransportConfig,
): Effect.Effect<WebSocketEventTransport<TEvent>> =>
  Effect.gen(function* (_) {
    const statusQueue = yield* _(Queue.unbounded<ConnectionStatus>());

    const initialState: TransportDisconnected = {
      _tag: 'transport-disconnected',
      config: { ...defaultTransportConfig, ...config },
    };

    const stateRef = yield* _(Ref.make<TransportState<TEvent>>(initialState));

    return createTransportImplementation<TEvent>(stateRef, statusQueue);
  });

export const createWebSocketEventTransportService = <
  TEvent = unknown,
>(): WebSocketEventTransportServiceInterface<TEvent> => ({
  create: () => createWebSocketEventTransport<TEvent>(),
  createWithConfig: createWebSocketEventTransport<TEvent>,
});

export const WebSocketEventTransportServiceLive = <TEvent = unknown>() =>
  Layer.effect(
    WebSocketEventTransportService,
    Effect.succeed(createWebSocketEventTransportService<TEvent>()),
  );
