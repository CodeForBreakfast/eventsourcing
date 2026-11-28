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

type Feeds = HashMap.HashMap<EventStreamId, PubSub.PubSub<NumberedEvent>>;

const FEED_CAPACITY = 256;

const addFeed = (streamId: EventStreamId, feeds: Feeds) =>
  Effect.map(
    PubSub.bounded<NumberedEvent>(FEED_CAPACITY),
    (pubsub) => [pubsub, HashMap.set(feeds, streamId, pubsub)] as const
  );

const getOrAddFeed = (streamId: EventStreamId) => (feeds: Feeds) =>
  pipe(
    feeds,
    HashMap.get(streamId),
    Option.match({
      onSome: (pubsub) => Effect.succeed([pubsub, feeds] as const),
      onNone: () => addFeed(streamId, feeds),
    })
  );

const publishIfFeedExists = (event: NumberedEvent) =>
  Option.match({
    onNone: () => Effect.void,
    onSome: (pubsub: PubSub.PubSub<NumberedEvent>) => Effect.asVoid(PubSub.publish(pubsub, event)),
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
      ref,
      SynchronizedRef.modifyEffect(getOrAddFeed(streamId)),
      Effect.flatMap(PubSub.subscribe)
    );

export const makeNumberedStreamFeeds: Effect.Effect<NumberedStreamFeeds> = Effect.map(
  SynchronizedRef.make<Feeds>(HashMap.empty()),
  (ref) => ({
    publish: publishToFeed(ref),
    subscribe: subscribeToFeed(ref),
  })
);
