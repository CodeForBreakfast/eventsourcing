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

const addSubscriptionDataToMap =
  <T>(streamId: EventStreamId, pubsub: PubSub.PubSub<T>) =>
  (subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
    HashMap.set(subs, streamId, { pubsub, subscribers: 0 });

const addSubscriptionToMap = <T>(streamId: EventStreamId, pubsub: PubSub.PubSub<T>) =>
  addSubscriptionDataToMap(streamId, pubsub);

const addPubsubToSubs =
  <T>(subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>, streamId: EventStreamId) =>
  (pubsub: PubSub.PubSub<T>) =>
    pipe(subs, addSubscriptionToMap(streamId, pubsub));

const createPubSubAndAddToMap = <T>(
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>,
  streamId: EventStreamId
) => pipe(512, PubSub.bounded<T>, Effect.map(addPubsubToSubs(subs, streamId)), Effect.runSync);

const addSubscriptionIfMissing =
  <T>(streamId: EventStreamId) =>
  (subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) => {
    const streamIdOption = pipe(subs, HashMap.get(streamId));

    return pipe(
      streamIdOption,
      Option.match({
        onNone: () => createPubSubAndAddToMap(subs, streamId),
        onSome: () => subs,
      })
    );
  };

const extractSubscriptionData =
  <T>(streamId: EventStreamId) =>
  (subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
    pipe(
      subscriptions,
      HashMap.get(streamId),
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
    SynchronizedRef.updateAndGet(ref, addSubscriptionIfMissing(streamId)),
    Effect.flatMap(extractSubscriptionData(streamId))
  );

const updateSubscribersCount =
  <T>(streamId: EventStreamId, delta: number) =>
  (subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
    HashMap.modify(subscriptions, streamId, (data) => ({
      ...data,
      subscribers: Math.max(0, data.subscribers + delta),
    }));

const incrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(SynchronizedRef.update(ref, updateSubscribersCount(streamId, 1)));

const decrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(SynchronizedRef.update(ref, updateSubscribersCount(streamId, -1)));

const filterActiveSubscriptions = <T>(
  subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
) => HashMap.filter(subscriptions, (data) => data.subscribers > 0);

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
  pipe(subData.pubsub, PubSub.subscribe, Effect.map(createStreamFromQueue));

const createStreamWithCleanup =
  <T>(
    ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
    streamId: EventStreamId
  ) =>
  (subData: SubscriptionData<T>) =>
    pipe(subData, subscribeToQueue, Effect.ensuring(decrementAndCleanup(ref, streamId)));

const createSubscribeError = (streamId: EventStreamId) =>
  eventStoreError.subscribe(streamId, `Failed to subscribe to stream: ${String(streamId)}`);

const createUnsubscribeError = (streamId: EventStreamId) =>
  eventStoreError.subscribe(streamId, `Failed to unsubscribe from stream: ${String(streamId)}`);

const subscribeToStreamEffect =
  <T>(streamId: EventStreamId) =>
  (ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>) =>
    pipe(
      getOrCreateSubscription(ref, streamId),
      Effect.tap(() => incrementSubscribers(ref, streamId)),
      Effect.flatMap(createStreamWithCleanup(ref, streamId)),
      Effect.mapError(createSubscribeError(streamId))
    );

const unsubscribeFromStreamEffect =
  <T>(streamId: EventStreamId) =>
  (ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>) =>
    pipe(decrementAndCleanup(ref, streamId), Effect.mapError(createUnsubscribeError(streamId)));

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
    ref,
    SynchronizedRef.get,
    Effect.map((subscriptions) => {
      const activeStreams = HashMap.size(subscriptions);
      const totalSubscribers = calculateTotalSubscribers(subscriptions);
      return { activeStreams, totalSubscribers };
    })
  );

const subscribeForManager =
  <T>(ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>) =>
  (streamId: EventStreamId) =>
    pipe(ref, subscribeToStreamEffect(streamId));

const unsubscribeForManager =
  <T>(ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>) =>
  (streamId: EventStreamId) =>
    pipe(ref, unsubscribeFromStreamEffect(streamId));

export const makeInMemorySubscriptionManager = <T>(): Effect.Effect<
  InMemorySubscriptionManagerService,
  never,
  never
> =>
  pipe(
    HashMap.empty(),
    SynchronizedRef.make<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
    Effect.map((ref) => ({
      subscribeToStream: subscribeForManager(ref),
      unsubscribeFromStream: unsubscribeForManager(ref),
      getSubscriptionMetrics: () => getMetricsEffect(ref),
    }))
  );

export const InMemorySubscriptionManagerLive = <T>() =>
  Layer.effect(InMemorySubscriptionManager, makeInMemorySubscriptionManager<T>());
