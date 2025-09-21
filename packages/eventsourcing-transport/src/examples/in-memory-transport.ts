import { Effect, Stream, Duration, pipe, Ref } from 'effect';
import {
  ConnectedTransport,
  Transport,
  TransportConfig,
  StreamMessage,
  TransportHealth,
  withTransport,
} from '../types.js';
import { TransportPublishError, TransportSubscriptionError } from '../errors.js';

/**
 * Example implementation of a connection-gated in-memory transport.
 * Demonstrates the proper use of Effect.acquireRelease for connection lifecycle.
 */

interface InMemoryStore {
  readonly streams: Map<string, StreamMessage[]>;
  readonly subscribers: Map<string, Set<(message: StreamMessage) => void>>;
  readonly metrics: {
    messagesPublished: number;
    messagesReceived: number;
    activeSubscriptions: number;
    connectionAttempts: number;
    errors: number;
  };
  readonly connected: boolean;
  readonly connectedAt?: Date;
}

const makeInMemoryTransport = (): Transport<unknown, string, never> => (_config) =>
  pipe(
    Ref.make<InMemoryStore>({
      streams: new Map(),
      subscribers: new Map(),
      metrics: {
        messagesPublished: 0,
        messagesReceived: 0,
        activeSubscriptions: 0,
        connectionAttempts: 0,
        errors: 0,
      },
      connected: false,
    }),
    Effect.flatMap((storeRef) =>
      Effect.acquireRelease(
        // Acquire: Update store and create transport
        pipe(
          Ref.update(storeRef, (store) => ({
            ...store,
            connected: true,
            connectedAt: new Date(),
            metrics: {
              ...store.metrics,
              connectionAttempts: store.metrics.connectionAttempts + 1,
            },
          })),
          Effect.map(() => createConnectedTransport(storeRef))
        ),
        // Release: Clean up connection
        (_connectedTransport) =>
          pipe(
            Ref.update(storeRef, (store) => ({
              ...store,
              connected: false,
              subscribers: new Map(),
            })),
            Effect.asVoid
          )
      )
    )
  );

const createConnectedTransport = (
  storeRef: Ref.Ref<InMemoryStore>
): ConnectedTransport<unknown, string, never> => ({
  publish: (streamId, data, metadata) =>
    pipe(
      Ref.get(storeRef),
      Effect.flatMap((store) => {
        if (!store.connected) {
          return Effect.fail(
            new TransportPublishError({
              message: 'Transport not connected',
              streamId,
            })
          );
        }

        const message: StreamMessage = {
          streamId,
          data,
          position: (store.streams.get(streamId)?.length ?? 0) + 1,
          timestamp: new Date(),
          metadata: metadata ?? {},
        };

        // Update store
        const newStreams = new Map(store.streams);
        const existingMessages = newStreams.get(streamId) ?? [];
        newStreams.set(streamId, [...existingMessages, message]);

        // Notify subscribers
        const subscribers = store.subscribers.get(streamId) ?? new Set();
        subscribers.forEach((callback) => callback(message));

        return pipe(
          Ref.set(storeRef, {
            ...store,
            streams: newStreams,
            metrics: {
              ...store.metrics,
              messagesPublished: store.metrics.messagesPublished + 1,
            },
          }),
          Effect.asVoid
        );
      })
    ),

  subscribe: (streamId, options) =>
    Stream.asyncEffect<StreamMessage, TransportSubscriptionError>((emit) =>
      pipe(
        Ref.get(storeRef),
        Effect.flatMap((store) => {
          if (!store.connected) {
            return Effect.fail(
              new TransportSubscriptionError({
                message: 'Transport not connected',
                streamId,
              })
            );
          }

          // Send existing messages if requested
          const existingMessages = store.streams.get(streamId) ?? [];
          const fromPosition = options?.fromPosition ?? 'end';

          let messagesToSend = existingMessages;
          if (fromPosition === 'end') {
            messagesToSend = [];
          } else if (typeof fromPosition === 'number') {
            messagesToSend = existingMessages.slice(fromPosition - 1);
          }

          messagesToSend.forEach((message) => emit.single(message));

          // Set up subscription for new messages
          const callback = (message: StreamMessage) => emit.single(message);
          const newSubscribers = new Map(store.subscribers);
          const streamSubscribers = newSubscribers.get(streamId) ?? new Set();
          streamSubscribers.add(callback);
          newSubscribers.set(streamId, streamSubscribers);

          return pipe(
            Ref.set(storeRef, {
              ...store,
              subscribers: newSubscribers,
              metrics: {
                ...store.metrics,
                activeSubscriptions: store.metrics.activeSubscriptions + 1,
              },
            }),
            Effect.as(
              Effect.sync(() => {
                // Cleanup function
                const cleanupEffect = pipe(
                  Ref.get(storeRef),
                  Effect.flatMap((currentStore) => {
                    const updatedSubscribers = new Map(currentStore.subscribers);
                    const streamSubs = updatedSubscribers.get(streamId);
                    if (streamSubs) {
                      streamSubs.delete(callback);
                      if (streamSubs.size === 0) {
                        updatedSubscribers.delete(streamId);
                      } else {
                        updatedSubscribers.set(streamId, streamSubs);
                      }
                    }

                    return Ref.set(storeRef, {
                      ...currentStore,
                      subscribers: updatedSubscribers,
                      metrics: {
                        ...currentStore.metrics,
                        activeSubscriptions: Math.max(
                          0,
                          currentStore.metrics.activeSubscriptions - 1
                        ),
                      },
                    });
                  }),
                  Effect.asVoid
                );

                // Execute cleanup immediately for simplicity
                Effect.runSync(cleanupEffect);
              })
            )
          );
        })
      )
    ),

  subscribeMultiple: (streamIds, options) =>
    Stream.mergeAll(
      streamIds.map((streamId) => createConnectedTransport(storeRef).subscribe(streamId, options)),
      { concurrency: 'unbounded' }
    ),

  health: pipe(
    Ref.get(storeRef),
    Effect.map(
      (store) =>
        ({
          connected: store.connected,
          lastHeartbeat: store.connectedAt ?? new Date(),
          errorCount: store.metrics.errors,
          uptime: store.connectedAt ? Date.now() - store.connectedAt.getTime() : 0,
        }) satisfies TransportHealth
    )
  ),

  metrics: pipe(
    Ref.get(storeRef),
    Effect.map((store) => store.metrics)
  ),
});

/**
 * Example usage demonstrating the connection-gated pattern
 */
export const exampleUsage = Effect.gen(function* (_) {
  const transport = makeInMemoryTransport();

  const config: TransportConfig = {
    url: 'in-memory://localhost',
    retryAttempts: 3,
    timeout: Duration.seconds(5),
  };

  // This is now impossible to misuse - you can't call publish/subscribe
  // without being connected, and cleanup happens automatically
  const result = yield* _(
    withTransport(transport, config, (connectedTransport) =>
      pipe(
        connectedTransport.publish('test-stream', { hello: 'world' }),
        Effect.flatMap(() => connectedTransport.health),
        Effect.flatMap((health) =>
          Effect.succeed({
            published: true,
            connected: health.connected,
          })
        )
      )
    )
  );

  return result;
});

export { makeInMemoryTransport };
