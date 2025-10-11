import { Effect, PubSub, Stream, Scope, pipe } from 'effect';
import { TodoEvent } from '../domain/todoEvents';
import { TodoListEvent } from '../domain/todoListEvents';

export type DomainEvent = {
  readonly streamId: string;
  readonly event: TodoEvent | TodoListEvent;
};

export interface EventBusService {
  readonly publish: (
    streamId: string
  ) => (event: TodoEvent | TodoListEvent) => Effect.Effect<void, never, never>;

  readonly subscribe: <TEvent extends DomainEvent['event']>(
    filter: (event: DomainEvent['event']) => event is TEvent
  ) => Effect.Effect<
    Stream.Stream<{ readonly streamId: string; readonly event: TEvent }, never, never>,
    never,
    Scope.Scope
  >;
}

export class EventBus extends Effect.Tag('EventBus')<EventBus, EventBusService>() {}

const createServiceFromPubSub = (pubsub: PubSub.PubSub<DomainEvent>): EventBusService => ({
  publish: (streamId: string) => (event: TodoEvent | TodoListEvent) =>
    PubSub.publish(pubsub, { streamId, event }),

  subscribe: <TEvent extends DomainEvent['event']>(
    filter: (event: DomainEvent['event']) => event is TEvent
  ) =>
    Effect.map(
      PubSub.subscribe(pubsub),
      Stream.filter(
        (domainEvent): domainEvent is { readonly streamId: string; readonly event: TEvent } =>
          filter(domainEvent.event)
      )
    ),
});

export const makeEventBus = (): Effect.Effect<EventBusService, never, never> =>
  pipe(PubSub.unbounded<DomainEvent>(), Effect.map(createServiceFromPubSub));
