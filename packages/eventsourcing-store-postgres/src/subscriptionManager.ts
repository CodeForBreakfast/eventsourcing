import {
  Chunk,
  Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  PubSub,
  Queue,
  Schedule,
  Stream,
  SynchronizedRef,
  pipe,
} from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import {
  EventStreamId,
  EventStreamPosition,
  EventStoreError,
  eventStoreError,
  type StreamEvent,
} from '@codeforbreakfast/eventsourcing-store';

/**
 * Container for subscription data for a specific stream
 */
interface SubscriptionData<T> {
  readonly pubsub: PubSub.PubSub<T>;
}

/**
 * How many of the most recent all-events publishes the manager keeps, so that an all-events
 * stream started after its subscribe call still receives what was published in between.
 */
const RECENT_ALL_EVENTS_LIMIT = 1024;

/**
 * The all-events feed, with a count of everything published to it and the most recent events
 */
interface AllEventsFeed {
  readonly pubsub: PubSub.PubSub<StreamEvent<string>>;
  readonly published: number;
  readonly recent: Chunk.Chunk<StreamEvent<string>>;
}

/**
 * State for the subscription manager
 */
interface SubscriptionManagerState {
  readonly streams: HashMap.HashMap<EventStreamId, SubscriptionData<string>>;
  readonly allEvents: AllEventsFeed;
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

  /**
   * Subscribe to all events from all streams
   */
  readonly subscribeToAllEvents: () => Effect.Effect<
    Stream.Stream<StreamEvent<string>, never>,
    EventStoreError,
    never
  >;

  /**
   * Publish an event to all-events subscribers
   */
  readonly publishToAllEvents: (
    position: EventStreamPosition,
    event: string
  ) => Effect.Effect<void, EventStoreError, never>;
}

export class SubscriptionManager extends Effect.Tag('SubscriptionManager')<
  SubscriptionManager,
  SubscriptionManagerService
>() {}

const updateHashMapWithPubSub =
  <T>(streamId: EventStreamId, subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) =>
  (pubsub: PubSub.PubSub<T>) => {
    const data = { pubsub };
    return HashMap.set(subs, streamId, data);
  };

const createPubSubAndUpdateHashMap = <T>(
  streamId: EventStreamId,
  subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
): HashMap.HashMap<EventStreamId, SubscriptionData<T>> =>
  pipe(256, PubSub.bounded<T>, Effect.map(updateHashMapWithPubSub(streamId, subs)), Effect.runSync);

const getOrCreateSubscription =
  <T>(streamId: EventStreamId) =>
  (
    subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
  ): HashMap.HashMap<EventStreamId, SubscriptionData<T>> =>
    pipe(
      subs,
      HashMap.get(streamId),
      Option.match({
        onNone: () => createPubSubAndUpdateHashMap(streamId, subs),
        onSome: () => subs,
      })
    );

const extractSubscriptionData =
  <T>(streamId: EventStreamId) =>
  (
    subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<T>>
  ): Effect.Effect<SubscriptionData<T>, never, never> =>
    pipe(
      subscriptions,
      HashMap.get(streamId),
      Option.match({
        onNone: () => Effect.die("Subscription should exist but doesn't"),
        onSome: Effect.succeed,
      })
    );

const updateStateWithNewSubscription =
  (streamId: EventStreamId) =>
  (state: SubscriptionManagerState): SubscriptionManagerState =>
    pipe(state.streams, getOrCreateSubscription<string>(streamId), (streams) => ({
      ...state,
      streams,
    }));

/**
 * Get or create a PubSub for a stream ID
 */
const getOrCreatePubSub = (
  ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>,
  streamId: EventStreamId
): Effect.Effect<SubscriptionData<string>, never, never> =>
  pipe(
    ref,
    SynchronizedRef.updateAndGet(updateStateWithNewSubscription(streamId)),
    Effect.map((state) => state.streams),
    Effect.flatMap(extractSubscriptionData(streamId))
  );

const updateStateByRemovingStream =
  (streamId: EventStreamId) =>
  (state: SubscriptionManagerState): SubscriptionManagerState => ({
    ...state,
    streams: HashMap.remove(state.streams, streamId),
  });

/**
 * Remove a subscription for a stream ID
 */
const removeSubscription = (
  ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(ref, SynchronizedRef.update(updateStateByRemovingStream(streamId)), Effect.as(undefined));

const publishEventToPubSub =
  (event: string, streamId: EventStreamId) =>
  (subData: ReadonlyDeep<SubscriptionData<string>>): Effect.Effect<void, never, never> =>
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

const publishToSubscriptionIfExists =
  (streamId: EventStreamId, event: string) =>
  (
    subscriptions: HashMap.HashMap<EventStreamId, SubscriptionData<string>>
  ): Effect.Effect<void, never, never> =>
    pipe(
      subscriptions,
      HashMap.get(streamId),
      Option.match({
        onNone: () => Effect.succeed(undefined),
        onSome: publishEventToPubSub(event, streamId),
      })
    );

/**
 * Publish an event to subscribers of a stream
 */
const publishToStream = (
  ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>,
  streamId: EventStreamId,
  event: string
): Effect.Effect<void, never, never> =>
  pipe(
    ref,
    SynchronizedRef.get,
    Effect.map((state) => state.streams),
    Effect.flatMap(publishToSubscriptionIfExists(streamId, event))
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

const createSubscriptionStream =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (streamId: EventStreamId): Effect.Effect<Stream.Stream<string, never>, EventStoreError, never> =>
    pipe(
      getOrCreatePubSub(ref, streamId),
      Effect.map(createStreamFromPubSub),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to subscribe to stream'))
    );

const unsubscribeFromStreamWithErrorHandling =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (streamId: EventStreamId): Effect.Effect<void, EventStoreError, never> =>
    pipe(
      removeSubscription(ref, streamId),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to unsubscribe from stream'))
    );

const publishEventWithErrorHandling =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (streamId: EventStreamId, event: string): Effect.Effect<void, EventStoreError, never> =>
    pipe(
      publishToStream(ref, streamId, event),
      Effect.mapError(eventStoreError.write(streamId, 'Failed to publish event to subscribers'))
    );

const warnOfMissedAllEvents = (lost: number) =>
  Effect.logWarning(
    'An all-events subscription started too late to receive every event published since it was made',
    { lost }
  );

const eventsPublishedSince = (
  feed: AllEventsFeed,
  publishedAtSubscribe: number
): Effect.Effect<Chunk.Chunk<StreamEvent<string>>, never, never> => {
  const missed = feed.published - publishedAtSubscribe;
  const lost = missed - Chunk.size(feed.recent);
  return Effect.as(
    Effect.when(warnOfMissedAllEvents(lost), () => lost > 0),
    Chunk.takeRight(feed.recent, missed)
  );
};

const replayThenLive =
  (live: Queue.Dequeue<StreamEvent<string>>) =>
  (missed: Chunk.Chunk<StreamEvent<string>>): Stream.Stream<StreamEvent<string>, never> =>
    pipe(missed, Stream.fromChunk, Stream.concat(Stream.fromQueue(live)));

const replayMissedThenLive =
  (feed: AllEventsFeed, publishedAtSubscribe: number) =>
  (live: Queue.Dequeue<StreamEvent<string>>) =>
    Effect.map(eventsPublishedSince(feed, publishedAtSubscribe), replayThenLive(live));

const subscribeAndReplayMissed =
  (publishedAtSubscribe: number) => (state: SubscriptionManagerState) =>
    pipe(
      state.allEvents.pubsub,
      PubSub.subscribe,
      Effect.flatMap(replayMissedThenLive(state.allEvents, publishedAtSubscribe)),
      Effect.map((stream) => [stream, state] as const)
    );

// Publishing to all-events holds this lock, so replaying what was published since the subscribe
// call and subscribing under the same lock leaves no gap between them. Doing both when the stream
// runs, not when subscribe returns, avoids holding a subscription for a stream that never runs.
const liveAllEventsSince = (
  ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>,
  publishedAtSubscribe: number
): Stream.Stream<StreamEvent<string>, never> =>
  Stream.unwrapScoped(
    SynchronizedRef.modifyEffect(ref, subscribeAndReplayMissed(publishedAtSubscribe))
  );

const subscribeToAllEventsStream =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (): Effect.Effect<Stream.Stream<StreamEvent<string>, never>, EventStoreError, never> =>
    pipe(
      ref,
      SynchronizedRef.get,
      Effect.map((state) => liveAllEventsSince(ref, state.allEvents.published))
    );

const recordPublished = (feed: AllEventsFeed, event: StreamEvent<string>): AllEventsFeed => ({
  ...feed,
  published: feed.published + 1,
  recent: pipe(feed.recent, Chunk.append(event), Chunk.takeRight(RECENT_ALL_EVENTS_LIMIT)),
});

const publishAndRecord =
  (event: StreamEvent<string>) =>
  (state: SubscriptionManagerState): Effect.Effect<SubscriptionManagerState, never, never> =>
    pipe(
      state.allEvents.pubsub,
      PubSub.publish(event),
      Effect.as({ ...state, allEvents: recordPublished(state.allEvents, event) })
    );

const publishToAllEventsWithErrorHandling =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (position: EventStreamPosition, event: string): Effect.Effect<void, EventStoreError, never> =>
    SynchronizedRef.updateEffect(ref, publishAndRecord({ position, event }));

const createSubscriptionManagerService = (
  ref: SynchronizedRef.SynchronizedRef<SubscriptionManagerState>
): SubscriptionManagerService => ({
  subscribeToStream: createSubscriptionStream(ref),
  unsubscribeFromStream: unsubscribeFromStreamWithErrorHandling(ref),
  publishEvent: publishEventWithErrorHandling(ref),
  subscribeToAllEvents: subscribeToAllEventsStream(ref),
  publishToAllEvents: publishToAllEventsWithErrorHandling(ref),
});

const makeSubscriptionManagerState = (
  allEventsPubSub: PubSub.PubSub<StreamEvent<string>>
): SubscriptionManagerState => ({
  streams: HashMap.empty(),
  allEvents: { pubsub: allEventsPubSub, published: 0, recent: Chunk.empty() },
});

const createManagerFromState = (
  allEventsPubSub: PubSub.PubSub<StreamEvent<string>>
): Effect.Effect<SubscriptionManagerService, never, never> =>
  pipe(
    allEventsPubSub,
    makeSubscriptionManagerState,
    SynchronizedRef.make<SubscriptionManagerState>,
    Effect.map(createSubscriptionManagerService)
  );

/**
 * Implementation of SubscriptionManager service
 */
export const SubscriptionManagerLive = Layer.effect(
  SubscriptionManager,
  pipe(PubSub.unbounded<StreamEvent<string>>(), Effect.flatMap(createManagerFromState))
);
