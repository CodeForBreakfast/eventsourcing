/**
 * WebSocket Transport Implementation
 *
 * A minimal, protocol-agnostic WebSocket transport that implements the
 * transport contracts. This focuses purely on message transport without
 * any event sourcing domain concepts.
 */

import { Effect, Stream, Scope, Ref, Queue, Duration, Deferred } from 'effect';
import type {
  TransportMessage,
  ConnectionState,
  ConnectedTransport,
  TransportConnector,
  TransportError,
  ConnectionError,
  MessageParseError,
  TransportFeatures,
  AdvancedTransport,
} from '@codeforbreakfast/eventsourcing-transport-contracts';

/**
 * WebSocket-specific transport features
 */
export const WEBSOCKET_FEATURES: TransportFeatures = {
  supportsReconnection: true,
  supportsOfflineBuffering: true,
  supportsBackpressure: false,
  guaranteesOrdering: true,
  supportsMultiplexing: true,
  supportsBatching: false,
  supportsCompression: false,
} as const;

/**
 * Internal WebSocket connection state
 */
interface WebSocketState {
  readonly socket: WebSocket | null;
  readonly connectionState: ConnectionState;
  readonly subscribers: Map<string, Queue.Queue<TransportMessage>>;
  readonly messageBuffer: Queue.Queue<TransportMessage>;
  readonly pendingRequests: Map<string, Deferred.Deferred<unknown, TransportError>>;
}

/**
 * WebSocket Transport implementation that focuses purely on message transport
 */
export class WebSocketTransport implements AdvancedTransport {
  public readonly features = WEBSOCKET_FEATURES;

  constructor(
    private readonly url: string,
    private readonly stateRef: Ref.Ref<WebSocketState>
  ) {}

  // ============================================================================
  // Connection Management
  // ============================================================================

  connect(): Effect.Effect<void, ConnectionError, never> {
    return Effect.gen(this, function* () {
      const currentState = yield* Ref.get(this.stateRef);

      if (currentState.connectionState === 'connected') {
        return; // Already connected
      }

      if (currentState.connectionState === 'connecting') {
        return; // Connection in progress
      }

      yield* Ref.update(this.stateRef, (state) => ({
        ...state,
        connectionState: 'connecting',
      }));

      try {
        const socket = new WebSocket(this.url);

        yield* Effect.async<void, ConnectionError>((resume) => {
          socket.onopen = () => {
            Effect.runSync(
              Ref.update(this.stateRef, (state) => ({
                ...state,
                socket,
                connectionState: 'connected',
              }))
            );
            resume(Effect.void);
          };

          socket.onerror = (error) => {
            Effect.runSync(
              Ref.update(this.stateRef, (state) => ({
                ...state,
                connectionState: 'error',
              }))
            );
            resume(
              Effect.fail(
                new ConnectionError({
                  message: 'WebSocket connection failed',
                  url: this.url,
                  cause: error,
                })
              )
            );
          };

          socket.onmessage = (event) => {
            Effect.runSync(this.handleIncomingMessage(event.data));
          };

          socket.onclose = () => {
            Effect.runSync(
              Ref.update(this.stateRef, (state) => ({
                ...state,
                socket: null,
                connectionState: 'disconnected',
              }))
            );
          };
        });
      } catch (error) {
        yield* Ref.update(this.stateRef, (state) => ({
          ...state,
          connectionState: 'error',
        }));

        return yield* Effect.fail(
          new ConnectionError({
            message: 'Failed to create WebSocket connection',
            url: this.url,
            cause: error,
          })
        );
      }
    });
  }

  disconnect(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);

      if (state.socket) {
        state.socket.close();
      }

      yield* Ref.update(this.stateRef, (currentState) => ({
        ...currentState,
        socket: null,
        connectionState: 'disconnected',
      }));
    });
  }

  isConnected(): Effect.Effect<boolean, never, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);
      return state.connectionState === 'connected';
    });
  }

  getState(): Effect.Effect<ConnectionState, never, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);
      return state.connectionState;
    });
  }

  // ============================================================================
  // Message Publishing
  // ============================================================================

  publish(message: TransportMessage): Effect.Effect<void, TransportError, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);

      if (!state.socket || state.connectionState !== 'connected') {
        // Buffer message if offline buffering is enabled
        if (this.features.supportsOfflineBuffering) {
          yield* Queue.offer(state.messageBuffer, message);
          return;
        }

        return yield* Effect.fail(
          new TransportError({
            message: 'Cannot publish message: not connected',
          })
        );
      }

      try {
        const serialized = JSON.stringify(message);
        state.socket.send(serialized);
      } catch (error) {
        return yield* Effect.fail(
          new TransportError({
            message: 'Failed to serialize or send message',
            cause: error,
          })
        );
      }
    });
  }

  // ============================================================================
  // Message Subscription
  // ============================================================================

  subscribe(
    filter?: (message: TransportMessage) => boolean
  ): Effect.Effect<Stream.Stream<TransportMessage, never, never>, TransportError, never> {
    return Effect.gen(this, function* () {
      const queue = yield* Queue.unbounded<TransportMessage>();
      const subscriptionId = Math.random().toString(36);

      yield* Ref.update(this.stateRef, (state) => ({
        ...state,
        subscribers: new Map(state.subscribers).set(subscriptionId, queue),
      }));

      const stream = Stream.fromQueue(queue);

      if (filter) {
        return Stream.filter(stream, filter);
      }

      return stream;
    });
  }

  // ============================================================================
  // Request/Response
  // ============================================================================

  request<TRequest = unknown, TResponse = unknown>(
    request: TRequest,
    timeoutMs = 30000
  ): Effect.Effect<TResponse, TransportError, never> {
    return Effect.gen(this, function* () {
      const requestId = Math.random().toString(36);
      const deferred = yield* Deferred.make<TResponse, TransportError>();

      yield* Ref.update(this.stateRef, (state) => ({
        ...state,
        pendingRequests: new Map(state.pendingRequests).set(requestId, deferred),
      }));

      const requestMessage: TransportMessage = {
        id: requestId,
        type: 'request',
        payload: request,
        metadata: { isRequest: true },
        timestamp: new Date(),
      };

      yield* this.publish(requestMessage);

      const timeoutEffect = Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(timeoutMs));
        yield* Deferred.fail(
          deferred,
          new TransportError({
            message: `Request timeout after ${timeoutMs}ms`,
          })
        );
      });

      const responseEffect = Deferred.await(deferred);

      return yield* Effect.race(responseEffect, timeoutEffect);
    });
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  simulateDisconnect(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      yield* Ref.update(this.stateRef, (state) => ({
        ...state,
        connectionState: 'reconnecting',
      }));
    });
  }

  simulateReconnect(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      yield* Ref.update(this.stateRef, (state) => ({
        ...state,
        connectionState: 'connected',
      }));

      // Flush buffered messages
      yield* this.flushBuffer();
    });
  }

  getBufferedMessageCount(): Effect.Effect<number, never, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);
      return yield* Queue.size(state.messageBuffer);
    });
  }

  flushBuffer(): Effect.Effect<void, TransportError, never> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.stateRef);

      while (true) {
        const takeResult = yield* Queue.poll(state.messageBuffer);
        if (takeResult._tag === 'None') break;

        yield* this.publish(takeResult.value);
      }
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleIncomingMessage(data: string): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      try {
        const message: TransportMessage = JSON.parse(data);
        const state = yield* Ref.get(this.stateRef);

        // Handle response to pending request
        if (message.metadata?.isResponse && message.metadata?.requestId) {
          const requestId = message.metadata.requestId as string;
          const pendingRequest = state.pendingRequests.get(requestId);

          if (pendingRequest) {
            yield* Deferred.succeed(pendingRequest, message.payload);
            yield* Ref.update(this.stateRef, (currentState) => {
              const newRequests = new Map(currentState.pendingRequests);
              newRequests.delete(requestId);
              return {
                ...currentState,
                pendingRequests: newRequests,
              };
            });
            return;
          }
        }

        // Distribute to all subscribers
        for (const queue of state.subscribers.values()) {
          yield* Queue.offer(queue, message);
        }
      } catch (error) {
        // Log parse error but don't crash the transport
        console.error('Failed to parse incoming message:', error);
      }
    });
  }
}

/**
 * WebSocket Transport Connector - the main entry point for creating connections
 */
export class WebSocketConnector implements TransportConnector {
  connect(url: string): Effect.Effect<ConnectedTransport, ConnectionError, Scope.Scope> {
    return Effect.gen(function* () {
      const initialState: WebSocketState = {
        socket: null,
        connectionState: 'disconnected',
        subscribers: new Map(),
        messageBuffer: yield* Queue.unbounded<TransportMessage>(),
        pendingRequests: new Map(),
      };

      const stateRef = yield* Ref.make(initialState);
      const transport = new WebSocketTransport(url, stateRef);

      yield* transport.connect();

      // Clean up on scope exit
      yield* Effect.addFinalizer(() => transport.disconnect());

      return transport;
    });
  }
}
