import { Effect, HashMap, Layer, Option, SynchronizedRef, pipe } from 'effect';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { ReadonlyDeep } from 'type-fest';

/**
 * EventStreamTracker service for tracking event ordering and deduplication
 */
export class EventStreamTracker extends Effect.Tag('EventStreamTracker')<
  EventStreamTracker,
  Readonly<{
    /**
     * Process an event, ensuring proper ordering and deduplication
     * Returns Some(event) if the event should be processed, None if it's a duplicate or out of order
     */
    readonly processEvent: <T>(
      streamId: EventStreamId,
      eventNumber: number,
      event: T
    ) => Effect.Effect<Option.Option<T>, never, never>;
  }>
>() {}

const getCurrentLastEvent = (
  lastEvents: HashMap.HashMap<EventStreamId, number>,
  streamId: EventStreamId
): number => Option.getOrElse(HashMap.get(lastEvents, streamId), () => -1);

const updateLastEvents = HashMap.set;

const processEventWithTracking =
  <T>(
    lastEventNumbers: ReadonlyDeep<
      SynchronizedRef.SynchronizedRef<HashMap.HashMap<EventStreamId, number>>
    >
  ) =>
  (streamId: EventStreamId, eventNumber: number, event: T) =>
    pipe(
      SynchronizedRef.modify(
        lastEventNumbers,
        (lastEvents: HashMap.HashMap<EventStreamId, number>) => {
          const currentLastEvent = getCurrentLastEvent(lastEvents, streamId);

          // Check if this is a new event we haven't seen
          if (eventNumber > currentLastEvent) {
            return [
              Option.some(event), // Return the event
              updateLastEvents(lastEvents, streamId, eventNumber),
            ];
          }

          // Event already processed or out of order
          return [Option.none(), lastEvents];
        }
      ),
      Effect.tap((result) =>
        Option.match(result, {
          onNone: () =>
            Effect.logDebug(
              `Duplicate or out-of-order event skipped: stream=${streamId}, eventNumber=${eventNumber}`
            ),
          onSome: () => Effect.succeed(undefined),
        })
      )
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
