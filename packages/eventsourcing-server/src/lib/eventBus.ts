import { Context, Effect, Layer, Option, ParseResult, PubSub, Scope, Stream } from 'effect';
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
export class EventBus extends Context.Tag('EventBus')<EventBus, EventBusService<any>>() {}

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
export const EventBusLive = <TEvent>(config: { store: Context.Tag<any, EventStore<TEvent>> }) => {
  return Layer.scoped(
    EventBus,
    Effect.gen(function* () {
      // Get EventStore from context
      const store = yield* config.store;

      // Create unbounded PubSub for internal event distribution
      const pubsub = yield* PubSub.unbounded<StreamEvent<TEvent>>();

      // Subscribe to all events from store
      const allEventsStream = yield* store.subscribeAll();

      // Pump events: store.subscribeAll() -> pubsub (background fiber)
      yield* Stream.runForEach(allEventsStream, (streamEvent) =>
        PubSub.publish(pubsub, streamEvent)
      ).pipe(Effect.forkScoped);

      // Return EventBus service
      return EventBus.of({
        subscribe: <TFiltered extends TEvent>(filter: (event: TEvent) => event is TFiltered) =>
          Effect.map(
            PubSub.subscribe(pubsub),
            Stream.filterMap(
              (streamEvent): Option.Option<StreamEvent<TFiltered>> =>
                filter(streamEvent.event)
                  ? Option.some({
                      position: streamEvent.position,
                      event: streamEvent.event as TFiltered,
                    })
                  : Option.none()
            )
          ),
      });
    })
  );
};
