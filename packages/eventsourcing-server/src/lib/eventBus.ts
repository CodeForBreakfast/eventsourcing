import { Effect, PubSub, Stream, Scope, Layer, Context, pipe } from 'effect';
import type { EventBusService, DomainEvent } from './types';

/**
 * Event Bus service tag
 * Provides internal pub/sub for domain events
 */
export class EventBus extends Context.Tag('EventBus')<EventBus, EventBusService>() {}

/**
 * Creates an event bus service from a PubSub
 *
 * @internal
 */
const createEventBusService = <TEvent>(
  pubsub: PubSub.PubSub<DomainEvent<TEvent>>
): EventBusService<TEvent> => ({
  publish: (event: DomainEvent<TEvent>) => pipe(pubsub, PubSub.publish(event), Effect.asVoid),

  subscribe: <TFilteredEvent extends TEvent>(filter: (event: TEvent) => event is TFilteredEvent) =>
    pipe(
      pubsub,
      PubSub.subscribe,
      Effect.map(
        Stream.filter((domainEvent): domainEvent is DomainEvent<TFilteredEvent> =>
          filter(domainEvent.event)
        )
      )
    ),
});

/**
 * Creates an event bus with scoped lifecycle
 *
 * The PubSub is scoped, so it will be automatically cleaned up when the scope closes.
 * All subscribers will also be cleaned up.
 *
 * @example
 * ```typescript
 * const program = pipe(
 *   makeEventBus<TodoEvent>(),
 *   Effect.flatMap((bus) =>
 *     pipe(
 *       bus.publish({ streamId: 'todo-1', event: todoCreated, position: 1 }),
 *       Effect.andThen(bus.subscribe((e): e is TodoCreated => e.type === 'TodoCreated')),
 *       Effect.flatMap((stream) => Stream.runCollect(stream))
 *     )
 *   ),
 *   Effect.scoped
 * );
 * ```
 */
export const makeEventBus = <TEvent = unknown>(): Effect.Effect<
  EventBusService<TEvent>,
  never,
  Scope.Scope
> => pipe(PubSub.unbounded<DomainEvent<TEvent>>(), Effect.map(createEventBusService));

/**
 * Creates a Layer for EventBus service
 *
 * @example
 * ```typescript
 * const layer = EventBusLive<TodoEvent>();
 *
 * const program = pipe(
 *   EventBus,
 *   Effect.flatMap((bus) => bus.publish(event)),
 *   Effect.provide(layer)
 * );
 * ```
 */
export const EventBusLive = <TEvent = unknown>() =>
  Layer.scoped(
    EventBus,
    makeEventBus<TEvent>() as Effect.Effect<EventBusService, never, Scope.Scope>
  );
