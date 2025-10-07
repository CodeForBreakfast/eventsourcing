import { SqlClient, SqlResolver } from '@effect/sql';
import { Effect, Layer, ParseResult, Schema, Sink, Stream, identity, pipe } from 'effect';
import {
  EventNumber,
  EventStreamId,
  EventStreamPosition,
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
  // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
  readonly insert: (row: EventRow) => Effect.Effect<EventRow, unknown, never>;
  readonly selectAllEventsInStream: (
    streamId: EventStreamId
  ) => Effect.Effect<readonly EventRow[], unknown, never>;
  readonly selectAllEvents: (
    nullValue: Schema.Schema.Type<typeof Schema.Null>
  ) => Effect.Effect<readonly EventRow[], unknown, never>;
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

const createEventRowResolvers = (sql: SqlClient.SqlClient) =>
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
  });

const buildEventRowServiceInterface = ({
  insertEventRow,
  selectAllEventsInStream,
  selectAllEvents,
}: {
  readonly insertEventRow: { readonly execute: EventRowServiceInterface['insert'] };
  readonly selectAllEventsInStream: {
    readonly execute: EventRowServiceInterface['selectAllEventsInStream'];
  };
  readonly selectAllEvents: { readonly execute: EventRowServiceInterface['selectAllEvents'] };
}): EventRowServiceInterface => ({
  insert: insertEventRow.execute,
  selectAllEventsInStream: selectAllEventsInStream.execute,
  selectAllEvents: selectAllEvents.execute,
});

const mapResolversToService = (sql: SqlClient.SqlClient) =>
  pipe(
    sql,
    createEventRowResolvers,
    Effect.map(buildEventRowServiceInterface),
    Effect.mapError(eventStoreError.write(undefined, 'Failed to initialize event row service'))
  );

export const makeEventRowService: Effect.Effect<
  EventRowServiceInterface,
  EventStoreError,
  SqlClient.SqlClient
> = pipe(SqlClient.SqlClient, Effect.flatMap(mapResolversToService));

/**
 * Layer that provides EventRowService
 */
export const EventRowServiceLive = Layer.effect(EventRowService, makeEventRowService);

/**
 * Event tracking layer - provides event ordering and deduplication services
 * Depends on database infrastructure for connection management
 */
export const EventTrackingLive = pipe(
  EventStreamTrackerLive(),
  Layer.provide(ConnectionManagerLive)
);

/**
 * Notification infrastructure layer - provides PostgreSQL LISTEN/NOTIFY handling
 * Depends on database infrastructure for connection management
 */
export const NotificationInfrastructureLive = pipe(
  NotificationListenerLive,
  Layer.provide(ConnectionManagerLive)
);

const mergeSubscriptionLayers = (
  a: typeof SubscriptionManagerLive,
  b: typeof EventTrackingLive,
  c: typeof NotificationInfrastructureLive
) => Layer.mergeAll(a, b, c);

/**
 * Combined layer that provides all the required services for real-time event subscriptions
 * Organized into logical groups for better understanding and testability
 */
export const EventSubscriptionServicesLive = mergeSubscriptionLayers(
  SubscriptionManagerLive,
  EventTrackingLive,
  NotificationInfrastructureLive
);

const publishEventToSubscribers = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId,
  payload: string
) => pipe(subscriptionManager.publishEvent(streamId, payload), Effect.asVoid);

const notifySubscribers = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId,
  payload: string
) =>
  pipe(
    publishEventToSubscribers(subscriptionManager, streamId, payload),
    Effect.catchAll(() => Effect.succeed(undefined))
  );

const concatStreams =
  (liveStream: Stream.Stream<string, EventStoreError, never>) =>
  (historicalStream: Stream.Stream<string, EventStoreError | ParseResult.ParseError, never>) =>
    Stream.concat(historicalStream, liveStream);

const getHistoricalEventsAndConcatWithLive =
  (eventRows: EventRowServiceInterface, from: EventStreamPosition) =>
  (liveStream: Stream.Stream<string, EventStoreError, never>) =>
    pipe(
      from.streamId,
      eventRows.selectAllEventsInStream,
      Effect.map((events: readonly EventRow[]) => {
        const filteredEvents = events
          // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
          .filter((event: EventRow) => event.event_number >= from.eventNumber)
          // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
          .map((event: EventRow) => event.event_payload);
        return Stream.fromIterable(filteredEvents);
      }),
      Effect.map(concatStreams(liveStream))
    );

const publishPayloadToSubscribers = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId,
  payload: NotificationPayload
) => publishEventToSubscribers(subscriptionManager, streamId, payload.event_payload);

const bridgeNotification = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId,
  payload: NotificationPayload
) =>
  pipe(
    Effect.logDebug(`Bridging notification for stream ${streamId}`, { payload }),
    Effect.andThen(publishPayloadToSubscribers(subscriptionManager, streamId, payload)),
    Effect.catchAll((error) =>
      Effect.logError(`Failed to bridge notification for stream ${streamId}`, {
        error,
      })
    )
  );

const bridgeNotificationEvent =
  (subscriptionManager: SubscriptionManagerService) =>
  (notification: { readonly streamId: EventStreamId; readonly payload: NotificationPayload }) =>
    bridgeNotification(subscriptionManager, notification.streamId, notification.payload);

const consumeNotifications = (
  notificationListener: Readonly<{
    readonly notifications: Stream.Stream<
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
      EventStoreError,
      never
    >;
  }>,
  subscriptionManager: SubscriptionManagerService
) =>
  pipe(
    notificationListener.notifications,
    Stream.mapEffect(bridgeNotificationEvent(subscriptionManager)),
    Stream.runDrain,
    Effect.fork,
    Effect.asVoid
  );

const startNotificationListener = (
  notificationListener: Readonly<{
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
      EventStoreError,
      never
    >;
  }>,
  subscriptionManager: SubscriptionManagerService
) =>
  pipe(
    notificationListener.start,
    Effect.andThen(consumeNotifications(notificationListener, subscriptionManager))
  );

const logBridgeStart = Effect.logInfo(
  'Starting notification bridge between PostgreSQL LISTEN/NOTIFY and SubscriptionManager'
);

const startBridge = (
  notificationListener: Readonly<{
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
      EventStoreError,
      never
    >;
  }>,
  subscriptionManager: SubscriptionManagerService
) =>
  Effect.andThen(
    logBridgeStart,
    startNotificationListener(notificationListener, subscriptionManager)
  );

const readHistoricalEvents = (eventRows: EventRowServiceInterface) => (from: EventStreamPosition) =>
  pipe(
    from.streamId,
    eventRows.selectAllEventsInStream,
    Effect.map((events: readonly EventRow[]) => {
      const filteredEvents = events
        // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
        .filter((event: EventRow) => event.event_number >= from.eventNumber)
        // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
        .map((event: EventRow) => event.event_payload);
      return Stream.fromIterable(filteredEvents);
    }),
    Effect.map((stream) =>
      Stream.mapError(
        stream,
        eventStoreError.read(from.streamId, 'Failed to read historical events')
      )
    ),
    Effect.mapError(eventStoreError.read(from.streamId, 'Failed to read historical events'))
  );

const subscribeToLiveStream = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId
) => subscriptionManager.subscribeToStream(streamId);

const combineHistoricalAndLiveStreams = (
  eventRows: EventRowServiceInterface,
  from: EventStreamPosition
) => getHistoricalEventsAndConcatWithLive(eventRows, from);

const subscribeToStreamWithHistory =
  (
    eventRows: EventRowServiceInterface,
    subscriptionManager: SubscriptionManagerService,
    notificationListener: Readonly<{
      readonly listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    }>
  ) =>
  (from: EventStreamPosition) =>
    pipe(
      from.streamId,
      notificationListener.listen,
      Effect.andThen(subscribeToLiveStream(subscriptionManager, from.streamId)),
      Effect.flatMap(combineHistoricalAndLiveStreams(eventRows, from)),
      Effect.map((stream) =>
        Stream.mapError(
          stream,
          eventStoreError.read(from.streamId, 'Failed to subscribe to stream')
        )
      ),
      Effect.mapError(eventStoreError.read(from.streamId, 'Failed to subscribe to stream'))
    );

const createWriteError = (streamId: string, error: unknown) =>
  pipe(error, eventStoreError.write(streamId, 'Failed to append event'));

const appendEventToStream =
  (eventRows: EventRowServiceInterface, subscriptionManager: SubscriptionManagerService) =>
  (end: EventStreamPosition, payload: string) =>
    pipe(
      end.streamId,
      eventRows.selectAllEventsInStream,
      Effect.map((events: readonly EventRow[]) => {
        if (events.length === 0) {
          return -1;
        }
        const lastEvent = events[events.length - 1];
        return lastEvent?.event_number;
      }),
      Effect.flatMap((last) => {
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
      // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
      Effect.map((row: EventRow) => ({
        streamId: row.stream_id,
        eventNumber: row.event_number + 1,
      })),
      Effect.tap(() => notifySubscribers(subscriptionManager, end.streamId, payload)),
      Effect.tapError((error) => Effect.logError('Error writing to event store', { error })),
      Effect.mapError((error) => {
        if (error instanceof ConcurrencyConflictError) {
          return error;
        }
        return createWriteError(end.streamId, error);
      }),
      Effect.flatMap(Schema.decode(EventStreamPosition))
    );

/**
 * Create a SQL-based EventStore with subscription support and PostgreSQL LISTEN/NOTIFY
 */
export const makeSqlEventStoreWithSubscriptionManager = (
  subscriptionManager: SubscriptionManagerService,

  notificationListener: Readonly<{
    readonly listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    readonly unlisten: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
      EventStoreError,
      never
    >;
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly stop: Effect.Effect<void, EventStoreError, never>;
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
      startBridge(notificationListener, subscriptionManager)
    ),
    Effect.map(({ eventRows, subscriptionManager, notificationListener }) => {
      const readWithEventRows = readHistoricalEvents(eventRows);
      const subscribeWithDependencies = subscribeToStreamWithHistory(
        eventRows,
        subscriptionManager,
        notificationListener
      );

      const eventStore: EventStore<string> = {
        append: (to: EventStreamPosition) => {
          const sink = Sink.foldEffect(
            to,
            () => true,
            appendEventToStream(eventRows, subscriptionManager)
          );

          return sink as Sink.Sink<
            EventStreamPosition,
            string,
            string,
            EventStoreError | ConcurrencyConflictError | ParseResult.ParseError
          >;
        },
        read: (
          from: EventStreamPosition
        ): Effect.Effect<
          Stream.Stream<string, ParseResult.ParseError | EventStoreError>,
          EventStoreError,
          never
        > => readWithEventRows(from),
        subscribe: (
          from: EventStreamPosition
        ): Effect.Effect<
          Stream.Stream<string, ParseResult.ParseError | EventStoreError>,
          EventStoreError,
          never
        > => subscribeWithDependencies(from),
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

const getSqlEventStoreManagerDependencies = Effect.all({
  subscriptionManager: SubscriptionManager,
  notificationListener: NotificationListener,
});

const makeSqlEventStoreEffect = pipe(
  getSqlEventStoreManagerDependencies,
  Effect.flatMap(({ subscriptionManager, notificationListener }) =>
    makeSqlEventStoreWithSubscriptionManager(subscriptionManager, notificationListener)
  )
);

const mergeEventStoreLayers = () =>
  Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive);

const createSqlEventStoreEffect = Layer.effect(SqlEventStore, makeSqlEventStoreEffect);

const createSqlEventStoreLayer = pipe(
  createSqlEventStoreEffect,
  Layer.provide(mergeEventStoreLayers())
);

/**
 * Main SQL EventStore layer with simplified dependency management
 * Uses the logical layer groups defined above for clearer composition
 */
export const SqlEventStoreLive = createSqlEventStoreLayer;

/**
 * Backward-compatible function - requires SubscriptionManager and NotificationListener in context
 */
const getSqlEventStoreDependencies = Effect.all({
  subscriptionManager: SubscriptionManager,
  notificationListener: NotificationListener,
});

export const sqlEventStore: Effect.Effect<
  EventStore<string>,
  EventStoreError,
  EventRowService | SubscriptionManager | NotificationListener
> = pipe(
  getSqlEventStoreDependencies,
  Effect.flatMap(({ subscriptionManager, notificationListener }) =>
    makeSqlEventStoreWithSubscriptionManager(subscriptionManager, notificationListener)
  )
);
