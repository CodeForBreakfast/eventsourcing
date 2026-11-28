import { SqlClient, SqlResolver } from '@effect/sql';
import {
  Effect,
  Layer,
  Match,
  Option,
  ParseResult,
  Queue,
  Schema,
  Sink,
  Stream,
  identity,
  pipe,
} from 'effect';
import {
  EventNumber,
  EventStreamId,
  EventStreamPosition,
  type EventStore,
  EventStoreError,
  eventStoreError,
  ConcurrencyConflictError,
  type StreamEvent,
} from '@codeforbreakfast/eventsourcing-store';
import { ConnectionManagerLive } from './connectionManager';
import { EventStreamTrackerLive } from './eventStreamTracker';
import {
  makeNumberedStreamFeeds,
  type NumberedEvent,
  type NumberedStreamFeeds,
} from './numberedStreamFeeds';
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

/**
 * Layer that provides EventRowService
 */
export const EventRowServiceLive = Layer.effect(
  EventRowService,
  pipe(SqlClient.SqlClient, Effect.flatMap(mapResolversToService))
);

/**
 * Combined layer that provides all the required services for real-time event subscriptions
 * Organized into logical groups for better understanding and testability
 */
export const EventSubscriptionServicesLive = Layer.mergeAll(
  SubscriptionManagerLive,
  pipe(EventStreamTrackerLive(), Layer.provide(ConnectionManagerLive)),
  pipe(NotificationListenerLive, Layer.provide(ConnectionManagerLive))
);

const eventsFrom = (events: readonly EventRow[], from: EventStreamPosition): readonly EventRow[] =>
  // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
  events.filter((event: EventRow) => event.event_number >= from.eventNumber);

const payloadsOf = (events: readonly EventRow[]): readonly string[] =>
  // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
  events.map((event: EventRow) => event.event_payload);

const bridgeStreamNotification = (
  subscriptionManager: SubscriptionManagerService,
  numberedFeeds: NumberedStreamFeeds,
  streamId: EventStreamId,
  payload: NotificationPayload
) =>
  pipe(
    numberedFeeds.publish(streamId, {
      eventNumber: payload.event_number,
      payload: payload.event_payload,
    }),
    Effect.andThen(subscriptionManager.publishEvent(streamId, payload.event_payload)),
    Effect.catchAll((error) =>
      Effect.logError(`Failed to bridge stream notification for stream ${streamId}`, {
        error,
      })
    )
  );

const bridgeAllEventsNotification = (
  subscriptionManager: SubscriptionManagerService,
  streamId: EventStreamId,
  payload: NotificationPayload
) =>
  pipe(
    subscriptionManager.publishToAllEvents(
      { streamId, eventNumber: payload.event_number },
      payload.event_payload
    ),
    Effect.catchAll((error) =>
      Effect.logError(`Failed to bridge all-events notification for stream ${streamId}`, {
        error,
      })
    )
  );

const bridgeNotificationEvent =
  (subscriptionManager: SubscriptionManagerService, numberedFeeds: NumberedStreamFeeds) =>
  (notification: {
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }) =>
    pipe(
      notification.isAllEvents,
      Match.value,
      Match.when(true, () =>
        bridgeAllEventsNotification(
          subscriptionManager,
          notification.streamId,
          notification.payload
        )
      ),
      Match.when(false, () =>
        bridgeStreamNotification(
          subscriptionManager,
          numberedFeeds,
          notification.streamId,
          notification.payload
        )
      ),
      Match.exhaustive
    );

const consumeNotifications = (
  notificationListener: Readonly<{
    readonly notifications: Stream.Stream<
      {
        readonly streamId: EventStreamId;
        readonly payload: NotificationPayload;
        readonly isAllEvents: boolean;
      },
      EventStoreError,
      never
    >;
  }>,
  subscriptionManager: SubscriptionManagerService,
  numberedFeeds: NumberedStreamFeeds
) =>
  pipe(
    notificationListener.notifications,
    Stream.mapEffect(bridgeNotificationEvent(subscriptionManager, numberedFeeds)),
    Stream.runDrain,
    Effect.fork,
    Effect.asVoid
  );

const startNotificationListener = (
  notificationListener: Readonly<{
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      {
        readonly streamId: EventStreamId;
        readonly payload: NotificationPayload;
        readonly isAllEvents: boolean;
      },
      EventStoreError,
      never
    >;
  }>,
  subscriptionManager: SubscriptionManagerService,
  numberedFeeds: NumberedStreamFeeds
) =>
  pipe(
    notificationListener.start,
    Effect.andThen(consumeNotifications(notificationListener, subscriptionManager, numberedFeeds))
  );

const readHistoricalEvents = (eventRows: EventRowServiceInterface) => (from: EventStreamPosition) =>
  pipe(
    from.streamId,
    eventRows.selectAllEventsInStream,
    Effect.map((events: readonly EventRow[]) =>
      Stream.fromIterable(payloadsOf(eventsFrom(events, from)))
    ),
    Effect.map((stream) =>
      Stream.mapError(
        stream,
        eventStoreError.read(from.streamId, 'Failed to read historical events')
      )
    ),
    Effect.mapError(eventStoreError.read(from.streamId, 'Failed to read historical events'))
  );

const isAfter =
  (lastDelivered: number) =>
  (event: NumberedEvent): boolean =>
    event.eventNumber > lastDelivered;

const deliverOnce = (
  lastDelivered: number,
  event: NumberedEvent
): readonly [number, Option.Option<NumberedEvent>] => [
  Math.max(lastDelivered, event.eventNumber),
  Option.liftPredicate(event, isAfter(lastDelivered)),
];

const payloadOf = (event: NumberedEvent): string => event.payload;

const liveEventsAfter = (
  live: Queue.Dequeue<NumberedEvent>,
  lastDelivered: number
): Stream.Stream<string, never> =>
  pipe(
    live,
    Stream.fromQueue,
    Stream.mapAccum(lastDelivered, deliverOnce),
    Stream.filterMap(Option.map(payloadOf))
  );

const lastEventNumber = (history: readonly EventRow[], from: EventStreamPosition): number =>
  history.reduce(
    // eslint-disable-next-line functional/prefer-immutable-types -- EventRow type comes from Postgres library and cannot be made immutable
    (last: number, event: EventRow) => Math.max(last, event.event_number),
    from.eventNumber - 1
  );

const historyThenLive =
  (from: EventStreamPosition, live: Queue.Dequeue<NumberedEvent>) =>
  (events: readonly EventRow[]): Stream.Stream<string, never> => {
    const history = eventsFrom(events, from);
    return pipe(
      history,
      payloadsOf,
      Stream.fromIterable,
      Stream.concat(liveEventsAfter(live, lastEventNumber(history, from)))
    );
  };

const readHistoryThenLive =
  (eventRows: EventRowServiceInterface, from: EventStreamPosition) =>
  (live: Queue.Dequeue<NumberedEvent>) =>
    Effect.map(eventRows.selectAllEventsInStream(from.streamId), historyThenLive(from, live));

// Subscribing to the live feed before reading history means every event reaches one or the
// other, and the live feed's event numbers drop what history already delivered. Doing both when
// the stream runs, not when subscribe returns, avoids holding a subscription for a stream that is
// never run.
const historyThenLiveWhenRun = (
  eventRows: EventRowServiceInterface,
  numberedFeeds: NumberedStreamFeeds,
  from: EventStreamPosition
): Stream.Stream<string, EventStoreError> =>
  Stream.unwrapScoped(
    pipe(
      from.streamId,
      numberedFeeds.subscribe,
      Effect.flatMap(readHistoryThenLive(eventRows, from)),
      Effect.mapError(eventStoreError.read(from.streamId, 'Failed to subscribe to stream'))
    )
  );

const subscribeToStreamWithHistory =
  (
    eventRows: EventRowServiceInterface,
    numberedFeeds: NumberedStreamFeeds,
    notificationListener: Readonly<{
      readonly listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    }>
  ) =>
  (from: EventStreamPosition) =>
    pipe(
      from.streamId,
      notificationListener.listen,
      Effect.as(historyThenLiveWhenRun(eventRows, numberedFeeds, from)),
      Effect.mapError(eventStoreError.read(from.streamId, 'Failed to subscribe to stream'))
    );

const createWriteError = (streamId: string, error: unknown) =>
  pipe(error, eventStoreError.write(streamId, 'Failed to append event'));

const appendEventToStream =
  (eventRows: EventRowServiceInterface) => (end: EventStreamPosition, payload: string) =>
    pipe(
      end.streamId,
      eventRows.selectAllEventsInStream,
      Effect.map((events: readonly EventRow[]) =>
        events.length === 0 ? -1 : events[events.length - 1]?.event_number
      ),
      Effect.flatMap((last) =>
        Effect.if(
          (end.eventNumber === 0 && last === -1) ||
            (last !== undefined && last === end.eventNumber - 1),
          {
            onTrue: () => Effect.succeed(end),
            onFalse: () =>
              Effect.fail(
                new ConcurrencyConflictError({
                  expectedVersion: end.eventNumber,
                  actualVersion: (last ?? -1) + 1,
                  streamId: end.streamId,
                })
              ),
          }
        )
      ),
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
      Effect.tapError((error) => Effect.logError('Error writing to event store', { error })),
      Effect.mapError((error) =>
        error instanceof ConcurrencyConflictError ? error : createWriteError(end.streamId, error)
      ),
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
    readonly listenAll: Effect.Effect<void, EventStoreError, never>;
    readonly unlistenAll: Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      {
        readonly streamId: EventStreamId;
        readonly payload: NotificationPayload;
        readonly isAllEvents: boolean;
      },
      EventStoreError,
      never
    >;
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly stop: Effect.Effect<void, EventStoreError, never>;
  }>
): Effect.Effect<EventStore<string>, EventStoreError, EventRowService> => {
  return pipe(
    EventRowService,
    Effect.flatMap((eventRowService) =>
      Effect.map(makeNumberedStreamFeeds, (numberedFeeds) => ({
        eventRows: eventRowService,
        numberedFeeds,
        subscriptionManager,
        notificationListener,
      }))
    ),
    Effect.tap(({ notificationListener, subscriptionManager, numberedFeeds }) =>
      startNotificationListener(notificationListener, subscriptionManager, numberedFeeds)
    ),
    Effect.map(({ eventRows, numberedFeeds, subscriptionManager, notificationListener }) => {
      const eventStore: EventStore<string> = {
        append: (to: EventStreamPosition) => {
          const sink = Sink.foldEffect(to, () => true, appendEventToStream(eventRows));

          return sink as Sink.Sink<
            EventStreamPosition,
            string,
            string,
            EventStoreError | ConcurrencyConflictError | ParseResult.ParseError
          >;
        },
        read: readHistoricalEvents(eventRows),
        subscribe: subscribeToStreamWithHistory(eventRows, numberedFeeds, notificationListener),
        subscribeAll: () => subscribeToAllStreams(subscriptionManager, notificationListener),
      };

      return eventStore;
    })
  );
};

/**
 * Subscribe to all events from all streams (live-only)
 * Consumes from the all-events PubSub
 */
const subscribeToAllStreams = (
  subscriptionManager: Readonly<{
    readonly subscribeToAllEvents: () => Effect.Effect<
      Stream.Stream<StreamEvent<string>, never>,
      EventStoreError,
      never
    >;
  }>,
  notificationListener: Readonly<{
    readonly listenAll: Effect.Effect<void, EventStoreError, never>;
  }>
) =>
  pipe(notificationListener.listenAll, Effect.andThen(subscriptionManager.subscribeToAllEvents()));

/**
 * Layer that provides a SQL EventStore with properly shared SubscriptionManager and NotificationListener
 */
export class SqlEventStore extends Effect.Tag('SqlEventStore')<
  SqlEventStore,
  EventStore<string>
>() {}

const buildSqlEventStore = ({
  subscriptionManager,
  notificationListener,
}: {
  readonly subscriptionManager: SubscriptionManagerService;
  readonly notificationListener: Readonly<{
    readonly listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    readonly unlisten: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;
    readonly listenAll: Effect.Effect<void, EventStoreError, never>;
    readonly unlistenAll: Effect.Effect<void, EventStoreError, never>;
    readonly notifications: Stream.Stream<
      {
        readonly streamId: EventStreamId;
        readonly payload: NotificationPayload;
        readonly isAllEvents: boolean;
      },
      EventStoreError,
      never
    >;
    readonly start: Effect.Effect<void, EventStoreError, never>;
    readonly stop: Effect.Effect<void, EventStoreError, never>;
  }>;
}) => makeSqlEventStoreWithSubscriptionManager(subscriptionManager, notificationListener);

const getSqlEventStoreDependencies = {
  subscriptionManager: SubscriptionManager,
  notificationListener: NotificationListener,
};

const SqlEventStoreEffect = Layer.effect(
  SqlEventStore,
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
  pipe(Effect.all(getSqlEventStoreDependencies), Effect.flatMap(buildSqlEventStore))
);

/**
 * Main SQL EventStore layer with simplified dependency management
 * Uses the logical layer groups defined above for clearer composition
 */
export const SqlEventStoreLive = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- SqlEventStoreEffect is the base layer being composed with dependencies
  SqlEventStoreEffect,
  Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive))
);

/**
 * Backward-compatible function - requires SubscriptionManager and NotificationListener in context
 */
export const sqlEventStore: Effect.Effect<
  EventStore<string>,
  EventStoreError,
  EventRowService | SubscriptionManager | NotificationListener
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
> = pipe(Effect.all(getSqlEventStoreDependencies), Effect.flatMap(buildSqlEventStore));
