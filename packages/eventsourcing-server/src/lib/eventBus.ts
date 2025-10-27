import { Context, Effect, ParseResult, Scope, Stream } from 'effect';
import { EventStoreError, type StreamEvent } from '@codeforbreakfast/eventsourcing-store';

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
