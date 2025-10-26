import { Effect, HashMap, Layer, Option, SynchronizedRef, pipe } from 'effect';
import { EventStreamId, EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import type { ReadonlyDeep } from 'type-fest';

/**
 * EventStreamTracker service for tracking event ordering and deduplication
 *
 * Note: The processEvent method has a generic type parameter, which means
 * it cannot use Effect service accessors. This is by design and doesn't
 * affect functionality - the service is accessed via yield* EventStreamTracker.
 */
export class EventStreamTracker extends Effect.Tag('EventStreamTracker')<
  EventStreamTracker,
  Readonly<{
    /**
     * Process an event, ensuring proper ordering and deduplication
     * Returns Some(event) if the event should be processed, None if it's a duplicate or out of order
     */
    readonly processEvent: <T>(
      position: EventStreamPosition,
      event: T
    ) => Effect.Effect<Option.Option<T>, never, never>;
  }>
>() {}

const getCurrentLastEvent = (
  lastEvents: HashMap.HashMap<EventStreamId, number>,
  streamId: EventStreamId
): number => Option.getOrElse(HashMap.get(lastEvents, streamId), () => -1);

const processEventWithTracking =
  <T>(
    lastEventNumbers: ReadonlyDeep<
      SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, number>>
    >
  ) =>
  (position: EventStreamPosition, event: T) =>
    SynchronizedRef.modify(
      lastEventNumbers,
      (lastEvents: HashMap.HashMap<EventStreamId, number>) => {
        const currentLastEvent = getCurrentLastEvent(lastEvents, position.streamId);

        return position.eventNumber > currentLastEvent
          ? [Option.some(event), HashMap.set(lastEvents, position.streamId, position.eventNumber)]
          : [Option.none(), lastEvents];
      }
    );

/**
 * Implementation of EventStreamTracker service
 */
export const EventStreamTrackerLive = () =>
  Layer.effect(
    EventStreamTracker,
    pipe(
      HashMap.empty<EventStreamId, number>(),
      SynchronizedRef.make<HashMap.HashMap<EventStreamId, number>>,
      Effect.map(
        (
          lastEventNumbers: ReadonlyDeep<
            SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, number>>
          >
        ) => ({
          processEvent: processEventWithTracking(lastEventNumbers),
        })
      )
    )
  );
