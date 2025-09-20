/**
 * State-based WebSocket connection implementation.
 *
 * This module provides a type-safe WebSocket API where each connection state
 * (disconnected, connecting, connected) has its own interface with only the
 * operations valid for that state. This design prevents runtime errors by
 * making invalid operations unrepresentable at the type level.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   createWebSocketConnection(),
 *   Effect.flatMap((connection) => connection.connect(url)),
 *   Effect.flatMap((connecting) => connecting.wait()),
 *   Effect.flatMap((connected) => connected.send(message))
 * );
 * ```
 */

import {
  Effect,
  Layer,
  Stream,
  Queue,
  Option,
  pipe,
  Duration,
  Data,
} from 'effect';
import type {
  WebSocketUrl,
  OutgoingMessage,
  ConnectionInfo,
  SendResult,
  DisconnectResult,
  DisconnectReason,
  MessageId,
} from './types';
import {
  createMetricsTracker,
  createEmptyMetricsTracker,
  type MetricsTracker,
  type ConnectionMetrics,
  type ConnectionQuality,
} from './connectionMetrics';

// Error types
export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  readonly reason: string;
  readonly code?: string;
}> {}

export class SendError extends Data.TaggedError('SendError')<{
  readonly reason: string;
  readonly messageId?: MessageId;
}> {}

export class ReceiveError extends Data.TaggedError('ReceiveError')<{
  readonly reason: string;
}> {}

// State-based interfaces - each state has only the operations valid for that state

/**
 * A disconnected WebSocket that can only be connected
 */
export interface DisconnectedWebSocket {
  readonly _tag: 'disconnected';
  readonly connect: (
    url: WebSocketUrl,
  ) => Effect.Effect<ConnectingWebSocket, ConnectionError>;
}

/**
 * A connecting WebSocket that can be awaited or aborted
 */
export interface ConnectingWebSocket {
  readonly _tag: 'connecting';
  readonly url: WebSocketUrl;
  readonly wait: () => Effect.Effect<ConnectedWebSocket, ConnectionError>;
  readonly abort: () => Effect.Effect<DisconnectedWebSocket>;
}

/**
 * A connected WebSocket that can send, receive, and disconnect
 */
export interface ConnectedWebSocket {
  readonly _tag: 'connected';
  readonly info: ConnectionInfo;
  readonly send: (
    data: OutgoingMessage,
  ) => Effect.Effect<SendResult, SendError>;
  readonly receive: () => Stream.Stream<string, ReceiveError>;
  readonly disconnect: (
    reason?: DisconnectReason,
  ) => Effect.Effect<DisconnectedWebSocket>;
  readonly metrics: () => Effect.Effect<ConnectionMetrics>;
  readonly quality: () => Effect.Effect<ConnectionQuality>;
}

// Union type for all possible states
export type WebSocketConnection =
  | DisconnectedWebSocket
  | ConnectingWebSocket
  | ConnectedWebSocket;

// Internal state management
interface InternalState {
  readonly websocket: Option.Option<WebSocket>;
  readonly metrics: MetricsTracker;
  readonly messageQueue: Option.Option<Queue.Queue<string>>;
  readonly messageIdCounter: bigint;
  readonly connectedAt: Option.Option<Date>;
}

// Helper to generate message IDs
const generateMessageId = (counter: bigint): MessageId =>
  `msg-${Date.now()}-${counter.toString(36)}` as MessageId;

/**
 * Creates a new WebSocket connection starting in disconnected state
 */
export const createWebSocketConnection =
  (): Effect.Effect<DisconnectedWebSocket> =>
    pipe(
      Effect.all({
        metrics: createMetricsTracker(),
        stateRef: Effect.sync(() => {
          // Use a mutable ref to share state between closures
          const stateContainer = {
            state: {
              websocket: Option.none(),
              metrics: createEmptyMetricsTracker(), // Proper initialization
              messageQueue: Option.none(),
              messageIdCounter: 0n,
              connectedAt: Option.none(),
            } as InternalState,
          };

          return {
            get: () => stateContainer.state,
            set: (newState: InternalState) => {
              stateContainer.state = newState;
            },
            update: (fn: (s: InternalState) => InternalState) => {
              stateContainer.state = fn(stateContainer.state);
            },
          };
        }),
      }),
      Effect.tap(({ stateRef, metrics }) =>
        Effect.sync(() => stateRef.set({ ...stateRef.get(), metrics })),
      ),
      Effect.map(({ stateRef }): DisconnectedWebSocket => {
        const createDisconnected = (): DisconnectedWebSocket => ({
          _tag: 'disconnected',

          connect: (
            url: WebSocketUrl,
          ): Effect.Effect<ConnectingWebSocket, ConnectionError> =>
            Effect.async<ConnectingWebSocket, ConnectionError>((resume) => {
              try {
                const ws = new WebSocket(url);

                // Create message queue synchronously
                const messageQueueEffect = Queue.unbounded<string>();
                const messageQueue = Effect.runSync(messageQueueEffect);

                // Record connection attempt
                const state = stateRef.get();
                void pipe(
                  state.metrics.recordConnectionAttempt(),
                  Effect.runPromise,
                );

                // Update state with new WebSocket
                stateRef.update((s) => ({
                  ...s,
                  websocket: Option.some(ws),
                  messageQueue: Option.some(messageQueue),
                }));

                // Create connecting state
                const connecting: ConnectingWebSocket = {
                  _tag: 'connecting',
                  url,

                  wait: (): Effect.Effect<
                    ConnectedWebSocket,
                    ConnectionError
                  > =>
                    Effect.async<ConnectedWebSocket, ConnectionError>(
                      (waitResume) => {
                        const state = stateRef.get();

                        if (Option.isNone(state.websocket)) {
                          waitResume(
                            Effect.fail(
                              new ConnectionError({
                                reason: 'WebSocket not found',
                                code: 'WS_NOT_FOUND',
                              }),
                            ),
                          );
                          return;
                        }

                        const socket = state.websocket.value;

                        socket.onopen = () => {
                          const info: ConnectionInfo = {
                            url,
                            connectedAt: new Date(),
                            readyState: socket.readyState,
                            protocol: socket.protocol,
                            extensions: socket.extensions,
                          };

                          // Update state
                          stateRef.update((s) => ({
                            ...s,
                            connectedAt: Option.some(info.connectedAt),
                          }));

                          // Record success metric
                          void pipe(
                            state.metrics.recordConnectionSuccess(),
                            Effect.runPromise,
                          );

                          // Create connected state
                          const connected: ConnectedWebSocket = {
                            _tag: 'connected',
                            info,

                            send: (
                              data: OutgoingMessage,
                            ): Effect.Effect<SendResult, SendError> =>
                              pipe(
                                Effect.try(() => {
                                  const currentState = stateRef.get();
                                  const messageId = generateMessageId(
                                    currentState.messageIdCounter,
                                  );
                                  const bytes = new TextEncoder().encode(
                                    data,
                                  ).length;

                                  socket.send(data);

                                  // Update counter and record metrics
                                  stateRef.update((s) => ({
                                    ...s,
                                    messageIdCounter: s.messageIdCounter + 1n,
                                  }));

                                  void pipe(
                                    currentState.metrics.recordMessageSent(
                                      bytes,
                                    ),
                                    Effect.runPromise,
                                  );

                                  return {
                                    messageId,
                                    sentAt: new Date(),
                                    message: data,
                                    bytesSize: bytes,
                                  };
                                }),
                                Effect.mapError(
                                  (error) =>
                                    new SendError({
                                      reason: String(error),
                                      messageId: 'unknown' as MessageId,
                                    }),
                                ),
                              ),

                            receive: (): Stream.Stream<
                              string,
                              ReceiveError
                            > => {
                              const currentState = stateRef.get();
                              return Option.match(currentState.messageQueue, {
                                onNone: () =>
                                  Stream.fail(
                                    new ReceiveError({
                                      reason: 'No message queue',
                                    }),
                                  ),
                                onSome: (queue) =>
                                  Stream.fromQueue(queue).pipe(
                                    Stream.mapError(
                                      () =>
                                        new ReceiveError({
                                          reason: 'Queue closed',
                                        }),
                                    ),
                                  ),
                              });
                            },

                            disconnect: (
                              reason = { _tag: 'user_initiated' },
                            ): Effect.Effect<DisconnectedWebSocket> =>
                              pipe(
                                Effect.sync(() => {
                                  const currentState = stateRef.get();

                                  return currentState.metrics.getMetrics().pipe(
                                    Effect.map((metrics) => {
                                      socket.close(1000, 'Normal closure');

                                      const duration = Option.match(
                                        currentState.connectedAt,
                                        {
                                          onNone: () => Duration.zero,
                                          onSome: (date) =>
                                            Duration.millis(
                                              Date.now() - date.getTime(),
                                            ),
                                        },
                                      );

                                      // Reset state
                                      stateRef.update((s) => ({
                                        ...s,
                                        websocket: Option.none(),
                                        messageQueue: Option.none(),
                                        connectedAt: Option.none(),
                                      }));

                                      const result: DisconnectResult = {
                                        url,
                                        connectionDuration: duration,
                                        messagesProcessed:
                                          metrics.messagesSent +
                                          metrics.messagesReceived,
                                        bytesSent: metrics.bytesSent,
                                        bytesReceived: metrics.bytesReceived,
                                        reason,
                                      };

                                      return result;
                                    }),
                                  );
                                }),
                                Effect.flatten,
                                Effect.map(createDisconnected),
                              ),

                            metrics: (): Effect.Effect<ConnectionMetrics> => {
                              const currentState = stateRef.get();
                              return currentState.metrics.getMetrics();
                            },

                            quality: (): Effect.Effect<ConnectionQuality> => {
                              const currentState = stateRef.get();
                              return currentState.metrics.getConnectionQuality();
                            },
                          };

                          waitResume(Effect.succeed(connected));
                        };

                        socket.onerror = () => {
                          void pipe(
                            state.metrics.recordConnectionFailure(),
                            Effect.runPromise,
                          );
                          waitResume(
                            Effect.fail(
                              new ConnectionError({
                                reason: 'WebSocket error occurred',
                                code: 'WS_ERROR',
                              }),
                            ),
                          );
                        };

                        socket.onmessage = (event) => {
                          const bytes = new TextEncoder().encode(
                            event.data,
                          ).length;
                          const currentState = stateRef.get();

                          Option.match(currentState.messageQueue, {
                            onNone: () => {},
                            onSome: (queue) => {
                              void pipe(
                                Queue.offer(queue, event.data),
                                Effect.runPromise,
                              );
                            },
                          });

                          void pipe(
                            currentState.metrics.recordMessageReceived(bytes),
                            Effect.runPromise,
                          );
                        };

                        socket.onclose = () => {
                          // Clean up state on unexpected close
                          stateRef.update((s) => ({
                            ...s,
                            websocket: Option.none(),
                            messageQueue: Option.none(),
                            connectedAt: Option.none(),
                          }));
                        };
                      },
                    ),

                  abort: (): Effect.Effect<DisconnectedWebSocket> =>
                    Effect.sync(() => {
                      const state = stateRef.get();

                      Option.match(state.websocket, {
                        onNone: () => {},
                        onSome: (ws) => {
                          ws.close(1000, 'Connection aborted');
                        },
                      });

                      // Reset state
                      stateRef.update((s) => ({
                        ...s,
                        websocket: Option.none(),
                        messageQueue: Option.none(),
                        connectedAt: Option.none(),
                      }));

                      return createDisconnected();
                    }),
                };

                resume(Effect.succeed(connecting));
              } catch (error) {
                resume(
                  Effect.fail(
                    new ConnectionError({
                      reason: String(error),
                      code: 'WS_CREATE_FAILED',
                    }),
                  ),
                );
              }
            }),
        });

        return createDisconnected();
      }),
    );

/**
 * WebSocket service for dependency injection.
 * Provides factory method to create new WebSocket connections.
 */
export interface WebSocketServiceInterface {
  readonly create: () => Effect.Effect<DisconnectedWebSocket>;
}

export class WebSocketService extends Effect.Tag('WebSocketService')<
  WebSocketService,
  WebSocketServiceInterface
>() {}

/**
 * Live implementation of the WebSocket service.
 * Use with Effect.provide() to inject into your program.
 */
export const WebSocketServiceLive = Layer.effect(
  WebSocketService,
  Effect.succeed({
    create: createWebSocketConnection,
  }),
);
