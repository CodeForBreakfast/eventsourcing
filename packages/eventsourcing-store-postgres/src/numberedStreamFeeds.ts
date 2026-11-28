import { Effect, HashMap, Option, PubSub, Queue, Scope, SynchronizedRef, pipe } from 'effect';
import { type EventStreamId } from '@codeforbreakfast/eventsourcing-store';

/**
 * An event's payload together with its number in its stream
 */
export interface NumberedEvent {
  readonly eventNumber: number;
  readonly payload: string;
}

/**
 * Per-stream live feeds that keep each event's number, so that a subscription can tell which
 * live events its history read already covered
 */
export interface NumberedStreamFeeds {
  readonly publish: (streamId: EventStreamId, event: NumberedEvent) => Effect.Effect<void>;
  readonly subscribe: (
    streamId: EventStreamId
  ) => Effect.Effect<Queue.Dequeue<NumberedEvent>, never, Scope.Scope>;
}

interface Feed {
  readonly pubsub: PubSub.PubSub<NumberedEvent>;
  readonly subscribers: number;
}

export type Feeds = HashMap.HashMap<EventStreamId, Feed>;

const FEED_CAPACITY = 256;

const addFeed = (streamId: EventStreamId, feeds: Feeds) =>
  Effect.map(
    PubSub.bounded<NumberedEvent>(FEED_CAPACITY),
    (pubsub) => [pubsub, HashMap.set(feeds, streamId, { pubsub, subscribers: 1 })] as const
  );

const joinFeed = (streamId: EventStreamId) => (feeds: Feeds) =>
  pipe(
    feeds,
    HashMap.get(streamId),
    Option.match({
      onSome: (feed) =>
        Effect.succeed([
          feed.pubsub,
          HashMap.set(feeds, streamId, { ...feed, subscribers: feed.subscribers + 1 }),
        ] as const),
      onNone: () => addFeed(streamId, feeds),
    })
  );

const hasOtherSubscribers = (feed: Feed) => feed.subscribers > 1;

const withoutOneSubscriber = (streamId: EventStreamId, feeds: Feeds) => (feed: Feed) =>
  pipe(
    feed,
    Option.liftPredicate(hasOtherSubscribers),
    Option.match({
      onSome: (shared) =>
        HashMap.set(feeds, streamId, { ...shared, subscribers: shared.subscribers - 1 }),
      onNone: () => HashMap.remove(feeds, streamId),
    })
  );

const leaveFeed = (streamId: EventStreamId) => (feeds: Feeds) =>
  pipe(
    feeds,
    HashMap.get(streamId),
    Option.match({
      onSome: withoutOneSubscriber(streamId, feeds),
      onNone: () => feeds,
    })
  );

const publishIfFeedExists = (event: NumberedEvent) =>
  Option.match({
    onNone: () => Effect.void,
    onSome: (feed: Feed) => Effect.asVoid(PubSub.publish(feed.pubsub, event)),
  });

const publishToFeed =
  (ref: SynchronizedRef.SynchronizedRef<Feeds>) =>
  (streamId: EventStreamId, event: NumberedEvent): Effect.Effect<void> =>
    pipe(
      ref,
      SynchronizedRef.get,
      Effect.map(HashMap.get(streamId)),
      Effect.flatMap(publishIfFeedExists(event))
    );

const subscribeToFeed =
  (ref: SynchronizedRef.SynchronizedRef<Feeds>) =>
  (streamId: EventStreamId): Effect.Effect<Queue.Dequeue<NumberedEvent>, never, Scope.Scope> =>
    pipe(
      Effect.acquireRelease(SynchronizedRef.modifyEffect(ref, joinFeed(streamId)), () =>
        SynchronizedRef.update(ref, leaveFeed(streamId))
      ),
      Effect.flatMap(PubSub.subscribe)
    );

export const numberedStreamFeedsOver = (
  ref: SynchronizedRef.SynchronizedRef<Feeds>
): NumberedStreamFeeds => ({
  publish: publishToFeed(ref),
  subscribe: subscribeToFeed(ref),
});

export const makeNumberedStreamFeeds: Effect.Effect<NumberedStreamFeeds> = Effect.map(
  SynchronizedRef.make<Feeds>(HashMap.empty()),
  numberedStreamFeedsOver
);
