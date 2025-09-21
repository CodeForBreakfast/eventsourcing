import { Effect, Stream, Schema, pipe, Chunk } from 'effect';
import type { RawTransport, SchemaTransport } from './schema-transport.js';
import { makeSchemaTransport, Codecs } from './schema-transport.js';
import {
  TransportConnectionError,
  TransportPublishError,
  TransportSubscriptionError,
} from './errors.js';

/**
 * Example domain message schemas for event sourcing
 */

// Simple event schema for example
export const SimpleEvent = Schema.Struct({
  type: Schema.String,
  aggregateId: Schema.String,
  data: Schema.Unknown,
});

export type SimpleEvent = Schema.Schema.Type<typeof SimpleEvent>;

/**
 * Example: WebSocket Raw Transport Implementation
 * Handles JSON encoding/decoding and WebSocket specifics
 */
export class WebSocketRawTransport implements RawTransport<string> {
  private socket?: WebSocket;

  constructor(private readonly url: string) {}

  connect = (): Effect.Effect<void, TransportConnectionError> =>
    Effect.async<void, TransportConnectionError>((resume) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => resume(Effect.void);
        this.socket.onerror = (error) =>
          resume(
            Effect.fail(TransportConnectionError.retryable(`WebSocket connection failed: ${error}`))
          );
      } catch (error) {
        resume(Effect.fail(TransportConnectionError.fatal(`Failed to create WebSocket: ${error}`)));
      }
    });

  publishRaw = (streamId: string, wireData: string, metadata?: Record<string, unknown>) =>
    Effect.try({
      try: () => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket not connected');
        }

        const message = {
          streamId,
          data: wireData,
          metadata,
          timestamp: new Date().toISOString(),
        };

        this.socket.send(JSON.stringify(message));
      },
      catch: (error) =>
        new TransportPublishError({
          message: `Failed to publish to ${streamId}: ${error}`,
          streamId,
        }),
    });

  subscribeRaw = (streamId: string) =>
    Stream.async<
      {
        readonly streamId: string;
        readonly wireData: string;
        readonly position?: number;
        readonly timestamp: Date;
        readonly metadata?: Record<string, unknown>;
      },
      TransportSubscriptionError
    >((emit) => {
      if (!this.socket) {
        emit.fail(
          new TransportSubscriptionError({
            message: 'WebSocket not connected',
            streamId,
          })
        );
        return;
      }

      const handler = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.streamId === streamId) {
            emit.single({
              streamId: parsed.streamId,
              wireData: parsed.data,
              position: parsed.position,
              timestamp: new Date(parsed.timestamp),
              metadata: parsed.metadata,
            });
          }
        } catch (error) {
          emit.fail(
            new TransportSubscriptionError({
              message: `Failed to parse message: ${error}`,
              streamId,
            })
          );
        }
      };

      this.socket.addEventListener('message', handler);

      return Effect.sync(() => {
        this.socket?.removeEventListener('message', handler);
      });
    });

  subscribeMultipleRaw = (streamIds: readonly string[]) =>
    Stream.mergeAll(
      streamIds.map((id) => this.subscribeRaw(id)),
      { concurrency: 'unbounded' }
    );

  health = Effect.succeed({
    connected: this.socket?.readyState === WebSocket.OPEN,
    lastHeartbeat: new Date(),
    errorCount: 0,
    uptime: 0,
  });

  metrics = Effect.succeed({
    messagesPublished: 0,
    messagesReceived: 0,
    activeSubscriptions: 0,
    connectionAttempts: 1,
    errors: 0,
  });

  close = () =>
    Effect.sync(() => {
      this.socket?.close();
    });
}

/**
 * Example: In-Memory Raw Transport Implementation
 * No encoding needed - works directly with objects
 */
export class InMemoryRawTransport<T> implements RawTransport<T> {
  private readonly streams = new Map<string, T[]>();
  private readonly subscribers = new Map<string, Set<(message: T) => void>>();

  connect = () => Effect.void;

  publishRaw = (streamId: string, wireData: T) =>
    Effect.sync(() => {
      if (!this.streams.has(streamId)) {
        this.streams.set(streamId, []);
      }

      this.streams.get(streamId)!.push(wireData);

      const streamSubscribers = this.subscribers.get(streamId);
      if (streamSubscribers) {
        streamSubscribers.forEach((callback) => callback(wireData));
      }
    });

  subscribeRaw = (streamId: string) =>
    Stream.async<
      {
        readonly streamId: string;
        readonly wireData: T;
        readonly position?: number;
        readonly timestamp: Date;
        readonly metadata?: Record<string, unknown>;
      },
      TransportSubscriptionError
    >((emit) => {
      if (!this.subscribers.has(streamId)) {
        this.subscribers.set(streamId, new Set());
      }

      const callback = (wireData: T) => {
        emit.single({
          streamId,
          wireData,
          position: this.streams.get(streamId)?.length ?? 0,
          timestamp: new Date(),
          metadata: {},
        });
      };

      this.subscribers.get(streamId)!.add(callback);

      return Effect.sync(() => {
        this.subscribers.get(streamId)?.delete(callback);
      });
    });

  subscribeMultipleRaw = (streamIds: readonly string[]) =>
    Stream.mergeAll(
      streamIds.map((id) => this.subscribeRaw(id)),
      { concurrency: 'unbounded' }
    );

  health = Effect.succeed({
    connected: true,
    lastHeartbeat: new Date(),
    errorCount: 0,
    uptime: Date.now(),
  });

  metrics = Effect.succeed({
    messagesPublished: Array.from(this.streams.values()).reduce((sum, arr) => sum + arr.length, 0),
    messagesReceived: 0,
    activeSubscriptions: this.subscribers.size,
    connectionAttempts: 1,
    errors: 0,
  });

  close = () =>
    Effect.sync(() => {
      this.streams.clear();
      this.subscribers.clear();
    });
}

/**
 * Example usage: Creating schema-aware transports
 */

// WebSocket transport for simple events
export const createWebSocketTransport = (url: string): SchemaTransport<SimpleEvent, string> => {
  const rawTransport = new WebSocketRawTransport(url);
  const codec = Codecs.json(SimpleEvent);
  return makeSchemaTransport(rawTransport, codec);
};

// In-memory transport for simple events (testing)
export const createInMemoryTransport = (): SchemaTransport<SimpleEvent, string> => {
  const rawTransport = new InMemoryRawTransport<SimpleEvent>();
  const codec = Codecs.identity(SimpleEvent);
  return makeSchemaTransport(rawTransport, codec);
};

// Binary transport example (would work with protobuf/msgpack)
export const createBinaryTransport = (
  rawTransport: RawTransport<Uint8Array>,
  binaryEncode: (data: unknown) => Uint8Array,
  binaryDecode: (data: Uint8Array) => unknown
): SchemaTransport<SimpleEvent, string> => {
  const codec = Codecs.binary(SimpleEvent, binaryEncode, binaryDecode);
  return makeSchemaTransport(rawTransport, codec);
};

/**
 * Example: Using the transport with proper typing
 */
export const transportUsageExample = () => {
  const transport = createWebSocketTransport('ws://localhost:8080');

  return pipe(
    transport.connect(),
    Effect.flatMap(() =>
      transport.publish('user-events', {
        type: 'UserCreated',
        aggregateId: 'user-123',
        data: { name: 'John Doe', email: 'john@example.com' },
      })
    ),
    Effect.flatMap(() =>
      pipe(transport.subscribe('user-events'), Stream.take(1), Stream.runCollect)
    ),
    Effect.tap((messages) =>
      Effect.sync(() => {
        // Type-safe access to message content
        Chunk.forEach(messages, (msg) => {
          console.log(`Event: ${msg.payload.type} for ${msg.payload.aggregateId}`);
          console.log(`Data:`, msg.payload.data);
        });
      })
    )
  );
};
