import {
  Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  PubSub,
  Queue,
  Schedule,
  Scope,
  Stream,
  SynchronizedRef,
  pipe,
} from 'effect';
import {
  EventStreamId,
  EventStoreError,
  EventStoreResourceError,
  eventStoreError,
} from '@codeforbreakfast/eventsourcing-store';

interface SubscriptionData<T> {
  readonly pubsub: PubSub.PubSub<T>;
  readonly subscribers: number;
}

export interface InMemorySubscriptionManagerService {
  readonly subscribeToStream: (
    streamId: EventStreamId
  ) => Effect.Effect<Stream.Stream<string, never>, EventStoreError, Scope.Scope>;

  readonly unsubscribeFromStream: (
    streamId: EventStreamId
  ) => Effect.Effect<void, EventStoreError, never>;

  readonly getSubscriptionMetrics: () => Effect.Effect<
    {
      readonly activeStreams: number;
      readonly totalSubscribers: number;
    },
    never,
    never
  >;
}

export class InMemorySubscriptionManager extends Effect.Tag('InMemorySubscriptionManager')<
  InMemorySubscriptionManager,
  InMemorySubscriptionManagerService
>() {}

const createPubSubAndAddToMap = <T>(
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>,
  streamId: EventStreamId
) =>
  pipe(
    PubSub.bounded<T>(512),
    Effect.map((pubsub) => {
      const data = { pubsub, subscribers: 0 };
      return HashMap.set(streamId, data)(subs);
    }),
    Effect.runSync
  );

const addSubscriptionIfMissing = <T>(
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>,
  streamId: EventStreamId
) => {
  const streamIdOption = HashMap.get(streamId)(subs);

  return pipe(
    streamIdOption,
    Option.match({
      onNone: () => createPubSubAndAddToMap(subs, streamId),
      onSome: () => subs,
    })
  );
};

const extractSubscriptionData = <T>(
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>,
  streamId: EventStreamId
) =>
  pipe(
    HashMap.get(streamId)(subscriptions),
    Option.match({
      onNone: () =>
        Effect.fail(
          new EventStoreResourceError({
            resource: `subscription for stream ${streamId}`,
            operation: 'create',
            cause: 'Failed to create subscription data',
          })
        ),
      onSome: (data: Readonly<SubscriptionData<T>>) => Effect.succeed(data),
    })
  );

const getOrCreateSubscription = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<SubscriptionData<T>, EventStoreResourceError, never> =>
  pipe(
    SynchronizedRef.updateAndGet(ref, (subs) => addSubscriptionIfMissing(subs, streamId)),
    Effect.flatMap((subscriptions) => extractSubscriptionData(subscriptions, streamId))
  );

const updateSubscribersCount = <T>(
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>,
  streamId: EventStreamId,
  delta: number
) =>
  pipe(
    subscriptions,
    HashMap.modify(streamId, (data) => ({
      ...data,
      subscribers: Math.max(0, data.subscribers + delta),
    }))
  );

const incrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      updateSubscribersCount(subscriptions, streamId, 1)
    )
  );

const decrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      updateSubscribersCount(subscriptions, streamId, -1)
    )
  );

const filterActiveSubscriptions = <T>(
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
) =>
  pipe(
    subscriptions,
    HashMap.filter((data) => data.subscribers > 0)
  );

const cleanupUnusedSubscriptions = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
): Effect.Effect<void, never, never> =>
  pipe(SynchronizedRef.update(ref, filterActiveSubscriptions));

const createRetrySchedule = () =>
  pipe(
    Schedule.exponential(Duration.millis(100), 1.5),
    Schedule.whileOutput((d) => Duration.toMillis(d) < 30000)
  );

const createStreamFromQueue = <T>(queue: Queue.Dequeue<T>) =>
  pipe(
    Stream.fromQueue(queue, { shutdown: true }),
    Stream.map(String),
    Stream.retry(createRetrySchedule())
  );

const decrementAndCleanup = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
) =>
  pipe(
    decrementSubscribers(ref, streamId),
    Effect.tap(() => cleanupUnusedSubscriptions(ref))
  );

const subscribeToQueue = <T>(subData: SubscriptionData<T>) =>
  pipe(PubSub.subscribe(subData.pubsub), Effect.map(createStreamFromQueue));

const createStreamWithCleanup = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId,
  subData: SubscriptionData<T>
) => pipe(subscribeToQueue(subData), Effect.ensuring(decrementAndCleanup(ref, streamId)));

const subscribeToStreamEffect = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
) =>
  pipe(
    getOrCreateSubscription(ref, streamId),
    Effect.tap(() => incrementSubscribers(ref, streamId)),
    Effect.flatMap((subData: SubscriptionData<T>) =>
      createStreamWithCleanup(ref, streamId, subData)
    ),
    Effect.mapError((error) =>
      eventStoreError.subscribe(streamId, `Failed to subscribe to stream: ${String(error)}`, error)
    )
  );

const unsubscribeFromStreamEffect = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
) =>
  pipe(
    decrementAndCleanup(ref, streamId),
    Effect.mapError((error) =>
      eventStoreError.subscribe(
        streamId,
        `Failed to unsubscribe from stream: ${String(error)}`,
        error
      )
    )
  );

const calculateTotalSubscribers = <T>(
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
) =>
  pipe(subscriptions, HashMap.values, (values) =>
    Array.from(values).reduce((sum, data) => sum + data.subscribers, 0)
  );

const getMetricsEffect = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
) =>
  pipe(
    SynchronizedRef.get(ref),
    Effect.map((subscriptions) => {
      const activeStreams = HashMap.size(subscriptions);
      const totalSubscribers = calculateTotalSubscribers(subscriptions);
      return { activeStreams, totalSubscribers };
    })
  );

export const makeInMemorySubscriptionManager = <T>(): Effect.Effect<
  InMemorySubscriptionManagerService,
  never,
  never
> =>
  pipe(
    SynchronizedRef.make<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>(HashMap.empty()),
    Effect.map((ref) => ({
      subscribeToStream: (streamId: EventStreamId) => subscribeToStreamEffect(ref, streamId),
      unsubscribeFromStream: (streamId: EventStreamId) =>
        unsubscribeFromStreamEffect(ref, streamId),
      getSubscriptionMetrics: () => getMetricsEffect(ref),
    }))
  );

export const InMemorySubscriptionManagerLive = <T>() =>
  Layer.effect(InMemorySubscriptionManager, makeInMemorySubscriptionManager<T>());
