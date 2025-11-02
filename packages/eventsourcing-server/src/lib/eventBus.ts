/* eslint-disable functional/prefer-immutable-types -- Implementation patterns required for functional composition */

import {
  Context,
  Effect,
  Layer,
  Option,
  ParseResult,
  pipe,
  PubSub,
  Queue,
  Scope,
  Stream,
} from 'effect';
import {
  EventStore,
  EventStoreError,
  type StreamEvent,
} from '@codeforbreakfast/eventsourcing-store';

/**
 * EventBus service interface
 */
export interface EventBusService<TEvent> {
  readonly subscribe: <TFiltered extends TEvent>(
    filter: (event: TEvent) => event is TFiltered
  ) => Effect.Effect<
    Stream.Stream<StreamEvent<TFiltered>, ParseResult.ParseError | EventStoreError>,
    never,
    Scope.Scope
  >;
}

/**
 * EventBus provides live cross-stream event distribution for server-side subscribers.
 *
 * Events are distributed via EventStore.subscribeAll() - live-only, best-effort delivery.
 * Subscribers receive filtered streams based on type guard predicates.
 *
 * @example
 * ```typescript
 * const eventBus = yield* EventBus;
 * const stream = yield* eventBus.subscribe(
 *   (event): event is TodoCreated => event._tag === 'TodoCreated'
 * );
 * ```
 */
export const EventBus = <TEvent>() =>
  Context.GenericTag<EventBusService<TEvent>, EventBusService<TEvent>>('EventBus');

/**
 * Creates an EventBus layer with a single shared subscription to EventStore.subscribeAll().
 * Each subscriber gets their own Dequeue from a shared PubSub, ensuring events are delivered
 * independently to all subscribers without race conditions.
 *
 * @param config.store - The EventStore tag to subscribe to (must be EventStore<TEvent>)
 * @returns Layer providing EventBus service
 *
 * @example
 * ```typescript
 * const layer = EventBusLive({ store: MyEventStoreTag });
 * const program = Effect.gen(function* () {
 *   const eventBus = yield* EventBus;
 *   // ... use eventBus
 * }).pipe(Effect.provide(layer));
 * ```
 */
export const EventBusLive = <TEvent>(config: {
  readonly store: Context.Tag<unknown, EventStore<TEvent>>;
}) => {
  const eventBusTag = EventBus<TEvent>();

  const filterEvent =
    <TFiltered extends TEvent>(filter: (event: TEvent) => event is TFiltered) =>
    (streamEvent: StreamEvent<TEvent>): Option.Option<StreamEvent<TFiltered>> => {
      try {
        // eslint-disable-next-line effect/prefer-match-over-ternary -- Simple boolean check for type guard, Match pattern would be unnecessarily verbose
        return filter(streamEvent.event)
          ? Option.some({
              position: streamEvent.position,
              event: streamEvent.event as TFiltered,
            })
          : Option.none();
      } catch {
        // Filter threw an exception - return none to skip this event for this subscriber
        return Option.none();
      }
    };

  const createQueueStream =
    <TFiltered extends TEvent>(filter: (event: TEvent) => event is TFiltered) =>
    (dequeue: Queue.Dequeue<StreamEvent<TEvent>>) =>
      pipe(dequeue, Stream.fromQueue, Stream.filterMap(filterEvent(filter)));

  const createFilteredStream =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    <TFiltered extends TEvent>(
      filter: (event: TEvent) => event is TFiltered
    ): Effect.Effect<
      Stream.Stream<StreamEvent<TFiltered>, ParseResult.ParseError | EventStoreError>,
      never,
      Scope.Scope
    > =>
      pipe(pubsub, PubSub.subscribe, Effect.map(createQueueStream(filter)));

  const publishEvent =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) => (event: StreamEvent<TEvent>) =>
      pipe(pubsub, PubSub.publish(event));

  const runPumpAndShutdown = (
    pubsub: PubSub.PubSub<StreamEvent<TEvent>>,
    eventStream: Stream.Stream<StreamEvent<TEvent>, ParseResult.ParseError | EventStoreError>
  ) =>
    pipe(
      eventStream,
      Stream.runForEach(publishEvent(pubsub)),
      Effect.ensuring(PubSub.shutdown(pubsub))
    );

  const createService = (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    Context.make(eventBusTag, {
      subscribe: createFilteredStream(pubsub),
    });

  const forkPumpAndCreateService =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    (eventStream: Stream.Stream<StreamEvent<TEvent>, ParseResult.ParseError | EventStoreError>) =>
      pipe(
        runPumpAndShutdown(pubsub, eventStream),
        Effect.forkScoped,
        Effect.zipRight(Effect.yieldNow()),
        Effect.as(createService(pubsub))
      );

  const subscribeStoreAndFork =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) => (store: EventStore<TEvent>) =>
      pipe(store.subscribeAll(), Effect.flatMap(forkPumpAndCreateService(pubsub)));

  const subscribeAndFork = (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    pipe(config.store, Effect.flatMap(subscribeStoreAndFork(pubsub)));

  return Layer.scopedContext(
    pipe(PubSub.unbounded<StreamEvent<TEvent>>(), Effect.flatMap(subscribeAndFork))
  );
};
