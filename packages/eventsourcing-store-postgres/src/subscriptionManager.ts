import {
  Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  PubSub,
  Schedule,
  Stream,
  SynchronizedRef,
  pipe,
} from 'effect';
import {
  EventStreamId,
  EventStoreError,
  eventStoreError,
} from '@codeforbreakfast/eventsourcing-store';

/**
 * Container for subscription data for a specific stream
 */
interface SubscriptionData<T> {
  pubsub: PubSub.PubSub<T>;
}

/**
 * SubscriptionManager service for managing subscriptions to event streams
 */
export interface SubscriptionManagerService {
  /**
   * Subscribe to a specific event stream and return a Stream of events
   */
  readonly subscribeToStream: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<string, never>, EventStoreError, never>;

  /**
   * Unsubscribe from a specific event stream
   */
  readonly unsubscribeFromStream: (
    streamId: EventStreamId
  ) => Effect.Effect<void, EventStoreError, never>;

  /**
   * Publish an event to all subscribers of a stream
   */
  readonly publishEvent: (
    streamId: EventStreamId,
    event: string
  ) => Effect.Effect<void, EventStoreError, never>;
}

export class SubscriptionManager extends Effect.Tag('SubscriptionManager')<
  SubscriptionManager,
  SubscriptionManagerService
>() {}

/**
 * Get or create a PubSub for a stream ID
 */
const getOrCreatePubSub = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<SubscriptionData<T>, never, never> =>
  pipe(
    SynchronizedRef.updateAndGet(
      ref,
      (subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) => {
        const streamIdOption = HashMap.get(streamId)(subs);

        return pipe(
          streamIdOption,
          Option.match({
            onNone: () => {
              const createPubSub = PubSub.bounded<T>(256);
              return pipe(
                subs,
                (s) =>
                  Effect.map(createPubSub, (pubsub) => {
                    const data = { pubsub };
                    return HashMap.set(streamId, data)(s);
                  }),
                Effect.runSync
              );
            },
            onSome: () => subs,
          })
        );
      }
    ),
    Effect.flatMap((subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
      pipe(
        HashMap.get(streamId)(subscriptions),
        Option.match({
          onNone: () => Effect.die("Subscription should exist but doesn't"),
          onSome: (data: Readonly<SubscriptionData<T>>) => Effect.succeed(data),
        })
      )
    )
  );

/**
 * Remove a subscription for a stream ID
 */
const removeSubscription = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) => {
      return pipe(subscriptions, HashMap.remove(streamId));
    }),
    Effect.as(undefined)
  );

/**
 * Publish an event to subscribers of a stream
 */
const publishToStream = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId,
  event: T
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.get(ref),
    Effect.flatMap((subscriptions) =>
      pipe(
        HashMap.get(streamId)(subscriptions),
        Option.match({
          onNone: () => Effect.succeed(undefined),
          onSome: (subData: Readonly<SubscriptionData<T>>) =>
            pipe(
              PubSub.publish(event)(subData.pubsub),
              Effect.tapError((error) =>
                Effect.logError('Failed to publish event to subscribers', {
                  error,
                  streamId,
                })
              )
            ),
        })
      )
    )
  );

/**
 * Implementation of SubscriptionManager service
 */
export const SubscriptionManagerLive = Layer.effect(
  SubscriptionManager,
  pipe(
    SynchronizedRef.make<HashMap.HashMap<EventStreamId, SubscriptionData<string>>>(HashMap.empty()),
    Effect.map((ref) => ({
      subscribeToStream: (
        streamId: EventStreamId
      ): Effect.Effect<Stream.Stream<string, never>, EventStoreError, never> =>
        pipe(
          getOrCreatePubSub(ref, streamId),
          Effect.map((pubsub: Readonly<SubscriptionData<string>>) =>
            pipe(
              Stream.fromPubSub(pubsub.pubsub),
              Stream.retry(
                pipe(
                  Schedule.exponential(Duration.millis(100), 1.5),
                  Schedule.whileOutput((d) => Duration.toMillis(d) < 30000)
                )
              )
            )
          ),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to subscribe to stream: ${String(error)}`,
              error
            )
          )
        ),

      unsubscribeFromStream: (
        streamId: EventStreamId
      ): Effect.Effect<void, EventStoreError, never> =>
        pipe(
          removeSubscription(ref, streamId),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to unsubscribe from stream: ${String(error)}`,
              error
            )
          )
        ),

      publishEvent: (
        streamId: EventStreamId,
        event: string
      ): Effect.Effect<void, EventStoreError, never> =>
        pipe(
          publishToStream(ref, streamId, event),
          Effect.mapError((error) =>
            eventStoreError.write(
              streamId,
              `Failed to publish event to subscribers: ${String(error)}`,
              error
            )
          )
        ),
    }))
  )
);
