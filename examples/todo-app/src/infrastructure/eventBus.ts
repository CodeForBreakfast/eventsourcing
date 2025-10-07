import { Effect, PubSub, Stream, Scope } from 'effect';
import { TodoEvent } from '../domain/todoEvents';
import { TodoListEvent } from '../domain/todoListEvents';

export type DomainEvent = {
  readonly streamId: string;
  readonly event: TodoEvent | TodoListEvent;
};

export interface EventBusService {
  readonly publish: (
    streamId: string,
    event: TodoEvent | TodoListEvent
  ) => Effect.Effect<void, never, never>;

  readonly subscribe: <TEvent extends DomainEvent['event']>(
    filter: (event: DomainEvent['event']) => event is TEvent
  ) => Effect.Effect<
    Stream.Stream<{ readonly streamId: string; readonly event: TEvent }, never, never>,
    never,
    Scope.Scope
  >;
}

export class EventBus extends Effect.Tag('EventBus')<EventBus, EventBusService>() {}

export const makeEventBus = (): Effect.Effect<EventBusService, never, never> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<DomainEvent>();

    return {
      publish: (streamId: string, event: TodoEvent | TodoListEvent) =>
        PubSub.publish(pubsub, { streamId, event }),

      subscribe: <TEvent extends DomainEvent['event']>(
        filter: (event: DomainEvent['event']) => event is TEvent
      ) =>
        Effect.map(
          PubSub.subscribe(pubsub),
          Stream.filter((domainEvent): domainEvent is { streamId: string; event: TEvent } =>
            filter(domainEvent.event)
          )
        ),
    };
  });
