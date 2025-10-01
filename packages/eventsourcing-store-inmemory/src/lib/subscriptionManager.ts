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

const getOrCreateSubscription = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<SubscriptionData<T>, EventStoreResourceError, never> =>
  pipe(
    SynchronizedRef.updateAndGet(
      ref,
      (subs: HashMap.HashMap<EventStreamId, SubscriptionData<T>>) => {
        const streamIdOption = HashMap.get(streamId)(subs);

        return pipe(
          streamIdOption,
          Option.match({
            onNone: () => {
              const createPubSub = PubSub.bounded<T>(512);
              return pipe(
                subs,
                (s) =>
                  Effect.map(createPubSub, (pubsub) => {
                    const data = { pubsub, subscribers: 0 };
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
      )
    )
  );

const incrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      pipe(
        subscriptions,
        HashMap.modify(streamId, (data) => ({
          ...data,
          subscribers: data.subscribers + 1,
        }))
      )
    )
  );

const decrementSubscribers = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>,
  streamId: EventStreamId
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      pipe(
        subscriptions,
        HashMap.modify(streamId, (data) => ({
          ...data,
          subscribers: Math.max(0, data.subscribers - 1),
        }))
      )
    )
  );

const cleanupUnusedSubscriptions = <T>(
  ref: SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>
): Effect.Effect<void, never, never> =>
  pipe(
    SynchronizedRef.update(ref, (subscriptions) =>
      pipe(
        subscriptions,
        HashMap.filter((data) => data.subscribers > 0)
      )
    )
  );

export const makeInMemorySubscriptionManager = <T>(): Effect.Effect<
  InMemorySubscriptionManagerService,
  never,
  never
> =>
  pipe(
    SynchronizedRef.make<HashMap.HashMap<EventStreamId, SubscriptionData<T>>>(HashMap.empty()),
    Effect.map((ref) => ({
      subscribeToStream: (
        streamId: EventStreamId
      ): Effect.Effect<Stream.Stream<string, never>, EventStoreError, Scope.Scope> =>
        pipe(
          getOrCreateSubscription(ref, streamId),
          Effect.tap(() => incrementSubscribers(ref, streamId)),
          Effect.flatMap((subData: SubscriptionData<T>) =>
            pipe(
              PubSub.subscribe(subData.pubsub),
              Effect.map((queue: Queue.Dequeue<T>) =>
                pipe(
                  Stream.fromQueue(queue, { shutdown: true }),
                  Stream.map(String), // Convert T to string for compatibility
                  Stream.retry(
                    pipe(
                      Schedule.exponential(Duration.millis(100), 1.5),
                      Schedule.whileOutput((d) => Duration.toMillis(d) < 30000)
                    )
                  )
                )
              ),
              Effect.ensuring(
                pipe(
                  decrementSubscribers(ref, streamId),
                  Effect.tap(() => cleanupUnusedSubscriptions(ref))
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
          decrementSubscribers(ref, streamId),
          Effect.tap(() => cleanupUnusedSubscriptions(ref)),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to unsubscribe from stream: ${String(error)}`,
              error
            )
          )
        ),

      getSubscriptionMetrics: (): Effect.Effect<
        {
          readonly activeStreams: number;
          readonly totalSubscribers: number;
        },
        never,
        never
      > =>
        pipe(
          SynchronizedRef.get(ref),
          Effect.map((subscriptions) => {
            const activeStreams = HashMap.size(subscriptions);
            const totalSubscribers = pipe(subscriptions, HashMap.values, (values) =>
              Array.from(values).reduce((sum, data) => sum + data.subscribers, 0)
            );
            return { activeStreams, totalSubscribers };
          })
        ),
    }))
  );

export const InMemorySubscriptionManagerLive = <T>() =>
  Layer.effect(InMemorySubscriptionManager, makeInMemorySubscriptionManager<T>());
