/* eslint-disable functional/prefer-immutable-types, effect/no-pipe-first-arg-call, effect/no-eta-expansion -- Implementation patterns required for functional composition */

import {
  Context,
  Effect,
  Layer,
  Match,
  Option,
  ParseResult,
  pipe,
  PubSub,
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
 * Creates an EventBus layer that subscribes to EventStore.subscribeAll()
 * and distributes events to subscribers via internal PubSub.
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
    (streamEvent: StreamEvent<TEvent>): Option.Option<StreamEvent<TFiltered>> =>
      pipe(
        filter(streamEvent.event),
        Match.value,
        Match.when(
          true,
          (): Option.Option<StreamEvent<TFiltered>> =>
            Option.some({
              position: streamEvent.position,
              event: streamEvent.event as TFiltered,
            })
        ),
        Match.when(false, (): Option.Option<StreamEvent<TFiltered>> => Option.none()),
        Match.exhaustive
      );

  const createSubscriber =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    <TFiltered extends TEvent>(filter: (event: TEvent) => event is TFiltered) =>
      pipe(pubsub, PubSub.subscribe, Effect.map(Stream.filterMap(filterEvent(filter))));

  const createService = (pubsub: PubSub.PubSub<StreamEvent<TEvent>>): EventBusService<TEvent> => ({
    subscribe: createSubscriber(pubsub),
  });

  const setupPump =
    (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
    (
      allEventsStream: Stream.Stream<StreamEvent<TEvent>, ParseResult.ParseError | EventStoreError>
    ) =>
      pipe(
        allEventsStream,
        Stream.runForEach((streamEvent) => PubSub.publish(pubsub, streamEvent)),
        Effect.forkScoped,
        Effect.as(createService(pubsub))
      );

  const setupAllWithStore =
    (store: EventStore<TEvent>) => (pubsub: PubSub.PubSub<StreamEvent<TEvent>>) =>
      pipe(store.subscribeAll(), Effect.flatMap(setupPump(pubsub)));

  const setupPubSub = (store: EventStore<TEvent>) =>
    pipe(PubSub.bounded<StreamEvent<TEvent>>(1024), Effect.flatMap(setupAllWithStore(store)));

  return Layer.scoped(eventBusTag, pipe(config.store, Effect.flatMap(setupPubSub)));
};
