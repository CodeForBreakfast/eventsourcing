import { SqlClient, SqlResolver } from '@effect/sql';
import { Effect, Layer, ParseResult, Schema, Sink, Stream, identity, pipe } from 'effect';
import {
  EventNumber,
  EventStreamId,
  EventStreamPosition,
  type ReadParams,
  type EventStore,
  EventStoreError,
  eventStoreError,
  ConcurrencyConflictError,
} from '@codeforbreakfast/eventsourcing-store';
import { ConnectionManagerLive } from './connectionManager';
import { EventStreamTrackerLive } from './eventStreamTracker';
import {
  NotificationListener,
  NotificationListenerLive,
  type NotificationPayload,
} from './notificationListener';
import {
  SubscriptionManager,
  SubscriptionManagerLive,
  type SubscriptionManagerService,
} from './subscriptionManager';

// Define the EventRowService interface
interface EventRowServiceInterface {
  readonly insert: (row: Readonly<EventRow>) => Effect.Effect<EventRow, unknown, never>;
  readonly selectAllEventsInStream: (
    streamId: EventStreamId
  ) => Effect.Effect<EventRow[], unknown, never>;
  readonly selectAllEvents: (
    nullValue: Schema.Schema.Type<typeof Schema.Null>
  ) => Effect.Effect<EventRow[], unknown, never>;
}

export class EventRowService extends Effect.Tag('EventRowService')<
  EventRowService,
  EventRowServiceInterface
>() {}

class EventRow extends Schema.Class<EventRow>('EventRow')({
  stream_id: EventStreamId,
  event_number: EventNumber,
  event_payload: Schema.String,
}) {}

export const makeEventRowService: Effect.Effect<
  EventRowServiceInterface,
  EventStoreError,
  SqlClient.SqlClient
> = pipe(
  SqlClient.SqlClient,
  Effect.flatMap((sql: SqlClient.SqlClient) =>
    pipe(
      Effect.all({
        insertEventRow: SqlResolver.ordered('InsertEventRow', {
          Request: EventRow,
          Result: EventRow,
          execute: (requests) => sql`
            INSERT INTO events ${sql.insert(requests)}
            RETURNING events.*
      `,
        }),
        selectAllEventsInStream: SqlResolver.grouped('SelectAllEventRowsInStream', {
          Request: EventStreamId,
          RequestGroupKey: identity,
          Result: EventRow,
          ResultGroupKey: (row) => row.stream_id,
          execute: (ids) => sql`
            SELECT * FROM events
            WHERE ${sql.in('stream_id', ids)}
            ORDER BY event_number
      `,
        }),
        selectAllEvents: SqlResolver.grouped('SelectAllEventRows', {
          Request: Schema.Null,
          RequestGroupKey: identity,
          Result: EventRow,
          ResultGroupKey: () => null,
          execute: () => sql`
            SELECT * FROM events
            ORDER BY stream_id, event_number
      `,
        }),
      }),
      Effect.map(
        ({
          insertEventRow,
          selectAllEventsInStream,
          selectAllEvents,
        }): EventRowServiceInterface => ({
          insert: insertEventRow.execute,
          selectAllEventsInStream: selectAllEventsInStream.execute,
          selectAllEvents: selectAllEvents.execute,
        })
      ),
      Effect.mapError((error) =>
        eventStoreError.write(
          undefined,
          `Failed to initialize event row service: ${String(error)}`,
          error
        )
      )
    )
  )
);

/**
 * Layer that provides EventRowService
 */
export const EventRowServiceLive = Layer.effect(EventRowService, makeEventRowService);

/**
 * Database infrastructure layer - provides core database connectivity
 * Exported for testing and reuse in other components
 */
export const DatabaseInfrastructureLive = ConnectionManagerLive;

/**
 * Event tracking layer - provides event ordering and deduplication services
 * Depends on database infrastructure for connection management
 */
export const EventTrackingLive = EventStreamTrackerLive().pipe(
  Layer.provide(DatabaseInfrastructureLive)
);

/**
 * Subscription management layer - provides in-memory subscription handling
 * Standalone service with no external dependencies
 */
export const SubscriptionManagementLive = SubscriptionManagerLive;

/**
 * Notification infrastructure layer - provides PostgreSQL LISTEN/NOTIFY handling
 * Depends on database infrastructure for connection management
 */
export const NotificationInfrastructureLive = NotificationListenerLive.pipe(
  Layer.provide(DatabaseInfrastructureLive)
);

/**
 * Combined layer that provides all the required services for real-time event subscriptions
 * Organized into logical groups for better understanding and testability
 */
export const EventSubscriptionServicesLive = Layer.mergeAll(
  SubscriptionManagementLive,
  EventTrackingLive,
  NotificationInfrastructureLive
);

// Helper to determine if parameter is ReadParams or EventStreamPosition
const isEventStreamPosition = (
  params: ReadParams | EventStreamPosition
): params is EventStreamPosition => 'eventNumber' in params;

// Helper to apply read options to event rows
const applyReadOptionsToEvents = (
  events: readonly EventRow[],
  options: Readonly<ReadParams>
): readonly EventRow[] =>
  pipe(
    events,
    // Apply fromEventNumber filter
    options.fromEventNumber !== undefined
      ? (evts) => evts.filter((event) => event.event_number >= options.fromEventNumber!)
      : (evts) => evts,
    // Apply toEventNumber filter
    options.toEventNumber !== undefined
      ? (evts) => evts.filter((event) => event.event_number <= options.toEventNumber!)
      : (evts) => evts,
    // Apply direction
    options.direction === 'backward' ? (evts) => [...evts].reverse() : (evts) => evts
  );

/**
 * Create a SQL-based EventStore with subscription support and PostgreSQL LISTEN/NOTIFY
 */
export const makeSqlEventStoreWithSubscriptionManager = (
  subscriptionManager: SubscriptionManagerService,
  notificationListener: Readonly<{
    listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    unlisten: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    notifications: Stream.Stream<
      { streamId: EventStreamId; payload: NotificationPayload },
      EventStoreError,
      never
    >;
    start: Effect.Effect<void, EventStoreError, never>;
    stop: Effect.Effect<void, EventStoreError, never>;
  }>
): Effect.Effect<EventStore<string>, EventStoreError, EventRowService> => {
  return pipe(
    EventRowService,
    Effect.map((eventRowService) => ({
      eventRows: eventRowService,
      subscriptionManager,
      notificationListener,
    })),
    Effect.tap(({ notificationListener, subscriptionManager }) =>
      // Start the notification bridge: consume notifications and publish to subscribers
      pipe(
        Effect.logInfo(
          'Starting notification bridge between PostgreSQL LISTEN/NOTIFY and SubscriptionManager'
        ),
        Effect.flatMap(() =>
          pipe(
            // Start the notification listener
            notificationListener.start,
            Effect.flatMap(() =>
              pipe(
                // Start consuming notifications and bridging to subscription manager
                notificationListener.notifications,
                Stream.tap(({ streamId, payload }) =>
                  pipe(
                    Effect.logDebug(`Bridging notification for stream ${streamId}`, { payload }),
                    Effect.flatMap(() =>
                      subscriptionManager.publishEvent(streamId, payload.event_payload)
                    ),
                    Effect.catchAll((error) =>
                      Effect.logError(`Failed to bridge notification for stream ${streamId}`, {
                        error,
                      })
                    )
                  )
                ),
                Stream.runDrain,
                Effect.fork, // Run in background
                Effect.asVoid
              )
            )
          )
        )
      )
    ),
    Effect.map(({ eventRows, subscriptionManager, notificationListener }) => {
      // Define an EventStore implementation
      const eventStore: EventStore<string> = {
        write: (to: EventStreamPosition) => {
          const sink = Sink.foldEffect(
            to,
            () => true,
            (end, payload: string) =>
              pipe(
                // Get all events in stream to check position
                eventRows.selectAllEventsInStream(end.streamId),
                Effect.map((events: readonly EventRow[]) => {
                  // Find the last event in the stream
                  if (events.length === 0) {
                    return -1;
                  }
                  const lastEvent = events[events.length - 1];
                  return lastEvent?.event_number;
                }),
                Effect.flatMap((last) => {
                  // Strict check for new streams
                  // For new streams, eventNumber should be 0 and last should be -1
                  // For existing streams, eventNumber should be last + 1
                  return (end.eventNumber === 0 && last === -1) ||
                    (last !== undefined && last === end.eventNumber - 1)
                    ? Effect.succeed(end)
                    : Effect.fail(
                        new ConcurrencyConflictError({
                          expectedVersion: end.eventNumber,
                          actualVersion: (last ?? -1) + 1,
                          streamId: end.streamId,
                        })
                      );
                }),
                Effect.flatMap((end: EventStreamPosition) =>
                  eventRows.insert({
                    event_number: end.eventNumber,
                    stream_id: end.streamId,
                    event_payload: payload,
                  })
                ),
                Effect.map((row: Readonly<EventRow>) => ({
                  streamId: row.stream_id,
                  eventNumber: row.event_number + 1,
                })),
                Effect.tap(() =>
                  // Notify subscribers about the new event
                  pipe(
                    subscriptionManager.publishEvent(end.streamId, payload),
                    Effect.catchAll(() => Effect.succeed(undefined)) // Don't fail if notification fails
                  )
                ),
                Effect.tapError((error) =>
                  Effect.logError('Error writing to event store', { error })
                ),
                Effect.mapError(
                  () =>
                    new ConcurrencyConflictError({
                      expectedVersion: end.eventNumber,
                      actualVersion: -1,
                      streamId: end.streamId,
                    })
                ),
                Effect.flatMap(Schema.decode(EventStreamPosition))
              )
          );

          return sink as Sink.Sink<
            EventStreamPosition,
            string,
            string,
            EventStoreError | ConcurrencyConflictError | ParseResult.ParseError
          >;
        },
        read: (
          params: ReadParams | EventStreamPosition
        ): Effect.Effect<
          Stream.Stream<string, ParseResult.ParseError | EventStoreError>,
          EventStoreError,
          never
        > => {
          if (isEventStreamPosition(params)) {
            // Legacy EventStreamPosition behavior - maintain live streaming
            return pipe(
              // Start PostgreSQL LISTEN for this stream
              notificationListener.listen(params.streamId),
              Effect.flatMap(() =>
                // Establish live subscription SECOND to receive bridged notifications
                subscriptionManager.subscribeToStream(params.streamId)
              ),
              Effect.flatMap((liveStream) =>
                pipe(
                  // Then get historical events
                  eventRows.selectAllEventsInStream(params.streamId),
                  Effect.map((events: readonly EventRow[]) => {
                    const filteredEvents = events
                      .filter(
                        (event: Readonly<EventRow>) => event.event_number >= params.eventNumber
                      )
                      .map((event: Readonly<EventRow>) => event.event_payload);
                    return Stream.fromIterable(filteredEvents);
                  }),
                  Effect.map((historicalStream) =>
                    // Combine historical events with live stream (PostgreSQL notifications handled by layer)
                    pipe(historicalStream, Stream.concat(liveStream))
                  )
                )
              ),
              Effect.map((stream) =>
                Stream.mapError(stream, (error) =>
                  eventStoreError.read(
                    params.streamId,
                    `Failed to read events from stream: ${String(error)}`,
                    error
                  )
                )
              ),
              Effect.mapError((error) =>
                eventStoreError.read(
                  params.streamId,
                  `Failed to read events from stream: ${String(error)}`,
                  error
                )
              )
            );
          }
          // New ReadParams behavior - historical only with options
          return pipe(
            eventRows.selectAllEventsInStream(params.streamId),
            Effect.map((events: readonly EventRow[]) => {
              const filteredEvents = applyReadOptionsToEvents(events, params);
              const eventPayloads = filteredEvents.map(
                (event: Readonly<EventRow>) => event.event_payload
              );

              // Apply batch size if specified
              return params.batchSize
                ? pipe(
                    // Create batches functionally
                    (() => {
                      const batchSize = params.batchSize;
                      return Array.from(
                        { length: Math.ceil(eventPayloads.length / batchSize) },
                        (_, i) => eventPayloads.slice(i * batchSize, (i + 1) * batchSize)
                      );
                    })(),
                    Stream.fromIterable,
                    Stream.flatMap((batch) => Stream.fromIterable(batch))
                  )
                : Stream.fromIterable(eventPayloads);
            }),
            Effect.mapError((error) =>
              eventStoreError.read(
                params.streamId,
                `Failed to read events with options: ${String(error)}`,
                error
              )
            )
          );
        },
        readHistorical: (
          params: ReadParams | EventStreamPosition
        ): Effect.Effect<
          Stream.Stream<string, ParseResult.ParseError | EventStoreError>,
          EventStoreError,
          never
        > => {
          if (isEventStreamPosition(params)) {
            // Legacy EventStreamPosition behavior
            return pipe(
              // Get only historical events without live subscription
              eventRows.selectAllEventsInStream(params.streamId),
              Effect.map((events: readonly EventRow[]) => {
                const filteredEvents = events
                  .filter((event: Readonly<EventRow>) => event.event_number >= params.eventNumber)
                  .map((event: Readonly<EventRow>) => event.event_payload);
                return Stream.fromIterable(filteredEvents);
              }),
              Effect.map((stream) =>
                Stream.mapError(stream, (error) =>
                  eventStoreError.read(
                    params.streamId,
                    `Failed to read historical events: ${String(error)}`,
                    error
                  )
                )
              ),
              Effect.mapError((error) =>
                eventStoreError.read(
                  params.streamId,
                  `Failed to read historical events: ${String(error)}`,
                  error
                )
              )
            );
          }
          // New ReadParams behavior with options
          return pipe(
            eventRows.selectAllEventsInStream(params.streamId),
            Effect.map((events: readonly EventRow[]) => {
              const filteredEvents = applyReadOptionsToEvents(events, params);
              const eventPayloads = filteredEvents.map(
                (event: Readonly<EventRow>) => event.event_payload
              );

              // Apply batch size if specified
              return params.batchSize
                ? pipe(
                    // Create batches functionally
                    (() => {
                      const batchSize = params.batchSize;
                      return Array.from(
                        { length: Math.ceil(eventPayloads.length / batchSize) },
                        (_, i) => eventPayloads.slice(i * batchSize, (i + 1) * batchSize)
                      );
                    })(),
                    Stream.fromIterable,
                    Stream.flatMap((batch) => Stream.fromIterable(batch))
                  )
                : Stream.fromIterable(eventPayloads);
            }),
            Effect.mapError((error) =>
              eventStoreError.read(
                params.streamId,
                `Failed to read historical events with options: ${String(error)}`,
                error
              )
            )
          );
        },
      };

      return eventStore;
    })
  );
};

/**
 * Layer that provides a SQL EventStore with properly shared SubscriptionManager and NotificationListener
 */
export class SqlEventStore extends Effect.Tag('SqlEventStore')<
  SqlEventStore,
  EventStore<string>
>() {}

/**
 * Main SQL EventStore layer with simplified dependency management
 * Uses the logical layer groups defined above for clearer composition
 */
export const SqlEventStoreLive = Layer.effect(
  SqlEventStore,
  pipe(
    Effect.all({
      subscriptionManager: SubscriptionManager,
      notificationListener: NotificationListener,
    }),
    Effect.flatMap(({ subscriptionManager, notificationListener }) =>
      makeSqlEventStoreWithSubscriptionManager(subscriptionManager, notificationListener)
    )
  )
).pipe(Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive)));

/**
 * Backward-compatible function - requires SubscriptionManager and NotificationListener in context
 */
export const sqlEventStore = (): Effect.Effect<
  EventStore<string>,
  EventStoreError,
  EventRowService | SubscriptionManager | NotificationListener
> =>
  pipe(
    Effect.all({
      subscriptionManager: SubscriptionManager,
      notificationListener: NotificationListener,
    }),
    Effect.flatMap(({ subscriptionManager, notificationListener }) =>
      makeSqlEventStoreWithSubscriptionManager(subscriptionManager, notificationListener)
    )
  );
