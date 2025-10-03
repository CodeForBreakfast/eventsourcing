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
import type { ReadonlyDeep } from 'type-fest';
import {
  EventStreamId,
  EventStoreError,
  eventStoreError,
} from '@codeforbreakfast/eventsourcing-store';

/**
 * Container for subscription data for a specific stream
 */
interface SubscriptionData<T> {
  readonly pubsub: PubSub.PubSub<T>;
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

const createPubSubAndUpdateHashMap = <T>(
  streamId: EventStreamId,
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): HashMap.HashMap<EventStreamId, SubscriptionData<T>> => {
  const createPubSub = PubSub.bounded<T>(256);
  return pipe(
    createPubSub,
    Effect.map((pubsub) => {
      const data = { pubsub };
      return HashMap.set(subs, streamId, data);
    }),
    Effect.runSync
  );
};

const getOrCreateSubscription = <T>(
  streamId: EventStreamId,
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): HashMap.HashMap<EventStreamId, SubscriptionData<T>> => {
  const streamIdOption = pipe(subs, HashMap.get(streamId));
  return pipe(
    streamIdOption,
    Option.match({
      onNone: () => createPubSubAndUpdateHashMap(streamId, subs),
      onSome: () => subs,
    })
  );
};

const extractSubscriptionData = <T>(
  streamId: EventStreamId,
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): Effect.Effect<SubscriptionData<T>, never, never> =>
  pipe(
    subscriptions,
    HashMap.get(streamId),
    Option.match({
      onNone: () => Effect.die("Subscription should exist but doesn't"),
      onSome: (data: ReadonlyDeep<SubscriptionData<T>>) => Effect.succeed(data),
    })
  );

/**
 * Get or create a PubSub for a stream ID
 */
const getOrCreatePubSub = <T>(
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
  >,
  streamId: EventStreamId
): Effect.Effect<SubscriptionData<T>, never, never> =>
  pipe(
    SynchronizedRef.updateAndGet(ref, (subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
      getOrCreateSubscription(streamId, subs)
    ),
    Effect.flatMap((subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
      extractSubscriptionData(streamId, subscriptions)
    )
  );

const removeStreamFromHashMap = <T>(
  streamId: EventStreamId,
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): HashMap.HashMap<EventStreamId, SubscriptionData<T>> =>
  pipe(streamId, (id) => HashMap.remove(subscriptions, id));

/**
 * Remove a subscription for a stream ID
 */
const removeSubscription = <T>(
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
  >,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      removeStreamFromHashMap(streamId, subscriptions)
    ),
    Effect.as(undefined)
  );

const publishEventToPubSub = <T>(
  event: T,
  streamId: EventStreamId,
  subData: ReadonlyDeep<SubscriptionData<T>>
): Effect.Effect<void, never, never> =>
  pipe(
    subData.pubsub,
    PubSub.publish(event),
    Effect.tapError((error) =>
      Effect.logError('Failed to publish event to subscribers', {
        error,
        streamId,
      })
    )
  );

const publishToSubscriptionIfExists = <T>(
  streamId: EventStreamId,
  event: T,
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): Effect.Effect<void, never, never> =>
  pipe(
    subscriptions,
    HashMap.get(streamId),
    Option.match({
      onNone: () => Effect.succeed(undefined),
      onSome: (subData: ReadonlyDeep<SubscriptionData<T>>) =>
        publishEventToPubSub(event, streamId, subData),
    })
  );

/**
 * Publish an event to subscribers of a stream
 */
const getSubscriptions = <T>(
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
  >
) => pipe(ref, SynchronizedRef.get);

const publishToStream = <T>(
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
  >,
  streamId: EventStreamId,
  event: T
): Effect.Effect<void, never, never> =>
  pipe(
    ref,
    getSubscriptions,
    Effect.flatMap((subscriptions) => publishToSubscriptionIfExists(streamId, event, subscriptions))
  );

const createRetrySchedule = (): Schedule.Schedule<Duration.Duration, unknown, never> =>
  pipe(
    Schedule.exponential(Duration.millis(100), 1.5),
    Schedule.whileOutput((d) => Duration.toMillis(d) < 30000)
  );

const createStreamFromPubSub = (
  pubsub: ReadonlyDeep<SubscriptionData<string>>
): Stream.Stream<string, never> =>
  pipe(
    pubsub.pubsub,
    (p) => Stream.fromPubSub(p as PubSub.PubSub<string>),
    Stream.retry(createRetrySchedule())
  );

const createSubscriptionStream = (
  streamId: EventStreamId,
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<string>>>
  >
): Effect.Effect<Stream.Stream<string, never>, EventStoreError, never> =>
  pipe(
    getOrCreatePubSub(ref, streamId),
    Effect.map(createStreamFromPubSub),
    Effect.mapError((error) =>
      eventStoreError.subscribe(streamId, `Failed to subscribe to stream: ${String(error)}`, error)
    )
  );

const unsubscribeFromStreamWithErrorHandling = (
  streamId: EventStreamId,
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<string>>>
  >
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
  );

const publishEventWithErrorHandling = (
  streamId: EventStreamId,
  event: string,
  ref: ReadonlyDeep<
    SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<string>>>
  >
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
  );

/**
 * Implementation of SubscriptionManager service
 */
export const SubscriptionManagerLive = Layer.effect(
  SubscriptionManager,
  pipe(
    HashMap.empty(),
    SynchronizedRef.make<HashMap.HashMap<EventStreamId, SubscriptionData<string>>>,
    Effect.map((ref) => ({
      subscribeToStream: (
        streamId: EventStreamId
      ): Effect.Effect<Stream.Stream<string, never>, EventStoreError, never> =>
        createSubscriptionStream(streamId, ref),

      unsubscribeFromStream: (
        streamId: EventStreamId
      ): Effect.Effect<void, EventStoreError, never> =>
        unsubscribeFromStreamWithErrorHandling(streamId, ref),

      publishEvent: (
        streamId: EventStreamId,
        event: string
      ): Effect.Effect<void, EventStoreError, never> =>
        publishEventWithErrorHandling(streamId, event, ref),
    }))
  )
);
