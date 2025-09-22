/**
 * WebSocket Transport Implementation
 *
 * A minimal WebSocket transport that implements the simplified transport contracts.
 * Uses Effect.acquireRelease for Scope-based lifecycle management.
 */

import { Effect, Stream, Scope, Ref, Queue, pipe } from 'effect';
import {
  TransportError,
  ConnectionError,
  type TransportMessage,
  type ConnectionState,
  type ConnectedTransport,
  type TransportConnectorService,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Internal State Types
// =============================================================================

interface WebSocketInternalState {
  readonly socket: WebSocket | null;
  readonly connectionState: ConnectionState;
  readonly connectionStateQueue: Queue.Queue<ConnectionState>;
  readonly subscribers: Set<Queue.Queue<TransportMessage>>;
}

// =============================================================================
// Connected WebSocket Transport
// =============================================================================

/**
 * A connected WebSocket transport instance.
 * This can only exist after a successful connection and lives within a Scope.
 */
class ConnectedWebSocketTransport implements ConnectedTransport<TransportMessage> {
  constructor(private readonly stateRef: Ref.Ref<WebSocketInternalState>) {}

  /**
   * Stream of connection state changes
   */
  get connectionState(): Stream.Stream<ConnectionState, never, never> {
    return Stream.unwrapScoped(
      pipe(
        Ref.get(this.stateRef),
        Effect.flatMap((state) =>
          pipe(
            Queue.unbounded<ConnectionState>(),
            Effect.tap((stateQueue) => Queue.offer(stateQueue, state.connectionState)),
            Effect.flatMap((stateQueue) =>
              pipe(
                Stream.fromQueue(state.connectionStateQueue),
                Stream.runForEach((newState) => Queue.offer(stateQueue, newState)),
                Effect.fork,
                Effect.as(Stream.fromQueue(stateQueue))
              )
            )
          )
        ),
        Effect.orDie // Convert any error to defect to satisfy the never error type
      ) as Effect.Effect<Stream.Stream<ConnectionState, never, never>, never, never>
    );
  }

  /**
   * Publish a message through the WebSocket
   */
  publish(message: TransportMessage): Effect.Effect<void, TransportError, never> {
    return pipe(
      Ref.get(this.stateRef),
      Effect.flatMap((state) => {
        if (!state.socket || state.connectionState !== 'connected') {
          return Effect.fail(
            new TransportError({
              message: 'Cannot publish message: WebSocket is not connected',
            })
          );
        }

        return Effect.try({
          try: () => {
            const serialized = JSON.stringify(message);
            state.socket!.send(serialized);
          },
          catch: (error) =>
            new TransportError({
              message: 'Failed to send message through WebSocket',
              cause: error,
            }),
        });
      })
    );
  }

  /**
   * Subscribe to messages with optional filtering
   */
  subscribe(
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> {
    return pipe(
      Queue.unbounded<TransportMessage>(),
      Effect.tap((queue) =>
        Ref.update(this.stateRef, (state) => ({
          ...state,
          subscribers: new Set([...state.subscribers, queue]),
        }))
      ),
      Effect.map((queue) => {
        let stream = Stream.fromQueue(queue);

        if (filter) {
          stream = Stream.filter(stream, (msg) => {
            try {
              return filter(msg);
            } catch {
              // If filter throws, skip the message
              return false;
            }
          });
        }

        return stream;
      })
    );
  }
}

// =============================================================================
// WebSocket Connector Service
// =============================================================================

/**
 * WebSocket connector that creates connected transports using Effect.acquireRelease
 */
export class WebSocketConnector implements TransportConnectorService<TransportMessage> {
  /**
   * Connect to a WebSocket URL and return a ConnectedTransport.
   * Uses Effect.acquireRelease for proper resource management.
   */
  connect(
    url: string
  ): Effect.Effect<ConnectedTransport<TransportMessage>, ConnectionError, Scope.Scope> {
    return Effect.acquireRelease(
      // Acquire: establish connection
      pipe(
        Queue.unbounded<ConnectionState>(),
        Effect.flatMap((connectionStateQueue) => {
          const initialState: WebSocketInternalState = {
            socket: null,
            connectionState: 'connecting',
            connectionStateQueue,
            subscribers: new Set(),
          };

          return pipe(
            Ref.make(initialState),
            Effect.tap((stateRef) => this.updateConnectionState(stateRef, 'connecting')),
            Effect.flatMap((stateRef) =>
              pipe(
                Effect.async<void, ConnectionError>((resume) => {
                  try {
                    const socket = new WebSocket(url);

                    socket.onopen = () => {
                      Effect.runSync(
                        pipe(
                          Ref.update(stateRef, (state) => ({
                            ...state,
                            socket,
                            connectionState: 'connected' as ConnectionState,
                          })),
                          Effect.flatMap(() => this.updateConnectionState(stateRef, 'connected'))
                        )
                      );
                      resume(Effect.void);
                    };

                    socket.onerror = (event) => {
                      Effect.runSync(this.updateConnectionState(stateRef, 'error'));
                      resume(
                        Effect.fail(
                          new ConnectionError({
                            message: 'Failed to connect to WebSocket',
                            url,
                            cause: event,
                          })
                        )
                      );
                    };

                    socket.onmessage = (event) => {
                      Effect.runSync(this.handleMessage(stateRef, event.data));
                    };

                    socket.onclose = () => {
                      Effect.runSync(this.updateConnectionState(stateRef, 'disconnected'));
                    };
                  } catch (error) {
                    resume(
                      Effect.fail(
                        new ConnectionError({
                          message: 'Failed to create WebSocket connection',
                          url,
                          cause: error,
                        })
                      )
                    );
                  }
                }),
                Effect.as(new ConnectedWebSocketTransport(stateRef))
              )
            )
          );
        })
      ),

      // Release: disconnect and cleanup
      (transport) => {
        const connectedTransport = transport as ConnectedWebSocketTransport;
        const stateRef = (connectedTransport as any).stateRef;

        return pipe(
          Ref.get(stateRef) as Effect.Effect<WebSocketInternalState, never, never>,
          Effect.flatMap((state) => {
            if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
              state.socket.close();
            }

            return Ref.update(stateRef, (s: WebSocketInternalState) => {
              const newState: WebSocketInternalState = {
                socket: null,
                connectionState: 'disconnected' as ConnectionState,
                connectionStateQueue: s.connectionStateQueue,
                subscribers: new Set<Queue.Queue<TransportMessage>>(),
              };
              return newState;
            });
          }),
          Effect.asVoid
        );
      }
    );
  }

  /**
   * Update connection state and notify all listeners
   */
  private updateConnectionState(
    stateRef: Ref.Ref<WebSocketInternalState>,
    newState: ConnectionState
  ): Effect.Effect<void, never, never> {
    return pipe(
      Ref.update(stateRef, (state) => ({
        ...state,
        connectionState: newState,
      })),
      Effect.flatMap(() => Ref.get(stateRef)),
      Effect.flatMap((state) => Queue.offer(state.connectionStateQueue, newState))
    );
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(
    stateRef: Ref.Ref<WebSocketInternalState>,
    data: string
  ): Effect.Effect<void, never, never> {
    return pipe(
      Effect.sync(() => {
        try {
          return JSON.parse(data) as TransportMessage;
        } catch {
          return null; // Return null for parse errors
        }
      }),
      Effect.flatMap((message) => {
        if (message === null) {
          // Silently ignore parse errors
          return Effect.void;
        }

        return pipe(
          Ref.get(stateRef),
          Effect.flatMap((state) =>
            Effect.forEach(state.subscribers, (queue) => Queue.offer(queue, message), {
              discard: true,
            })
          ),
          Effect.asVoid
        );
      })
    );
  }
}
