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
 * State for the subscription manager
 */
interface SubscriptionManagerState {
  readonly streams: HashMap.HashMap<EventStreamId, SubscriptionData<string>>;
  readonly allEventsPubSub: PubSub.PubSub<StreamEvent<string>>;
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

const createAllEventsStreamFromPubSub = (
  pubsub: PubSub.PubSub<StreamEvent<string>>
): Stream.Stream<StreamEvent<string>, never> =>
  pipe(Stream.fromPubSub(pubsub), Stream.retry(createRetrySchedule()));

const subscribeToAllEventsStream =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (): Effect.Effect<Stream.Stream<StreamEvent<string>, never>, EventStoreError, never> =>
    pipe(
      ref,
      SynchronizedRef.get,
      Effect.map((state) => createAllEventsStreamFromPubSub(state.allEventsPubSub)),
      Effect.mapError(eventStoreError.subscribe('*', 'Failed to subscribe to all events'))
    );

const publishToAllEventsPubSub =
  (position: EventStreamPosition, event: string) =>
  (pubsub: PubSub.PubSub<StreamEvent<string>>): Effect.Effect<void, never, never> =>
    pipe(
      pubsub,
      PubSub.publish({ position, event }),
      Effect.tapError((error) =>
        Effect.logError('Failed to publish to all-events', { error, streamId: position.streamId })
      )
    );

const publishEventToAllEventsPubSub =
  (position: EventStreamPosition, event: string) =>
  (state: SubscriptionManagerState): Effect.Effect<void, never, never> =>
    pipe(state.allEventsPubSub, publishToAllEventsPubSub(position, event));

const publishToAllEventsWithErrorHandling =
  (ref: ReadonlyDeep<SynchronizedRef.SynchronizedRef<SubscriptionManagerState>>) =>
  (position: EventStreamPosition, event: string): Effect.Effect<void, EventStoreError, never> =>
    pipe(
      ref,
      SynchronizedRef.get,
      Effect.flatMap(publishEventToAllEventsPubSub(position, event)),
      Effect.mapError(
        eventStoreError.write(position.streamId, 'Failed to publish to all-events subscribers')
      )
    );

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
  allEventsPubSub,
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
