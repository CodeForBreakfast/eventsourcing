import { SqlError } from '@effect/sql';
import { PgClient } from '@effect/sql-pg';
import {
  Deferred,
  Effect,
  Layer,
  Match,
  Stream,
  Queue,
  RcMap,
  Schedule,
  Schema,
  pipe,
} from 'effect';
import {
  EventStreamId,
  EventStoreError,
  eventStoreError,
} from '@codeforbreakfast/eventsourcing-store';

/**
 * Interface for handling notification events
 */
export interface NotificationPayload {
  readonly stream_id: string;
  readonly event_number: number;
  readonly event_payload: string;
}

/**
 * Creates a notification channel name for a stream ID
 */
export const makeChannelName = (streamId: EventStreamId): string => `eventstore_events_${streamId}`;

/**
 * Global channel name for all events (used by subscribeAll)
 */
export const ALL_EVENTS_CHANNEL = 'eventstore_events_all';

/**
 * Prefix of the payloads a listener sends to its own channel to learn that LISTEN is active.
 * Every listener on the channel receives them, so every listener drops them.
 */
const LISTEN_PROBE_PREFIX = 'eventstore_listen_probe:';

const LISTEN_PROBE_INTERVAL = '10 millis';

/**
 * Parse notification payload from PostgreSQL trigger JSON
 */
const decodeNotificationSchema = Schema.decodeUnknown(
  Schema.Struct({
    stream_id: Schema.String,
    event_number: Schema.Number,
    event_payload: Schema.String,
  })
);

const parseNotificationPayload = (
  jsonString: string
): Effect.Effect<NotificationPayload, EventStoreError, never> =>
  pipe(
    jsonString,
    (str) =>
      Effect.try({
        try: () => JSON.parse(str) as NotificationPayload,
        catch: eventStoreError.read(undefined, 'Failed to parse notification payload'),
      }),
    Effect.flatMap(decodeNotificationSchema),
    Effect.mapError(
      eventStoreError.read(undefined, 'Failed to validate notification payload schema')
    )
  );

/**
 * NotificationListener service for managing PostgreSQL LISTEN/NOTIFY operations
 */
export class NotificationListener extends Effect.Tag('NotificationListener')<
  NotificationListener,
  Readonly<{
    /**
     * Listen for notifications on a specific stream's channel
     */
    readonly listen: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;

    /**
     * Stop listening for notifications on a specific stream's channel
     */
    readonly unlisten: (streamId: EventStreamId) => Effect.Effect<void, EventStoreError, never>;

    /**
     * Listen for notifications on the global all-events channel
     */
    readonly listenAll: Effect.Effect<void, EventStoreError, never>;

    /**
     * Stop listening to the global all-events channel
     */
    readonly unlistenAll: Effect.Effect<void, EventStoreError, never>;

    /**
     * Get a stream of notifications for all channels we're listening to
     */
    readonly notifications: Stream.Stream<
      {
        readonly streamId: EventStreamId;
        readonly payload: NotificationPayload;
        readonly isAllEvents: boolean;
      },
      EventStoreError,
      never
    >;

    /**
     * Start the notification listener background process
     */
    readonly start: Effect.Effect<void, EventStoreError, never>;

    /**
     * Stop the notification listener and cleanup
     */
    readonly stop: Effect.Effect<void, EventStoreError, never>;
  }>
>() {}

/**
 * Full PostgreSQL LISTEN/NOTIFY implementation using @effect/sql-pg
 */
const parseStreamIdAndQueueNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>,
    isAllEvents: boolean
  ) =>
  (payload: NotificationPayload) =>
    pipe(
      payload.stream_id,
      Schema.decode(EventStreamId),
      Effect.flatMap((parsedStreamId) =>
        Queue.offer(notificationQueue, {
          streamId: parsedStreamId,
          payload,
          isAllEvents,
        })
      ),
      Effect.mapError(
        eventStoreError.read(undefined, 'Failed to parse stream_id from notification')
      )
    );

const parseAndQueueStreamNotification = (
  rawPayload: string,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  isAllEvents: boolean
) =>
  pipe(
    rawPayload,
    parseNotificationPayload,
    Effect.flatMap(parseStreamIdAndQueueNotification(notificationQueue, isAllEvents))
  );

const processRawNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>,
    channelName: string,
    isAllEvents: boolean
  ) =>
  (rawPayload: string) =>
    pipe(
      parseAndQueueStreamNotification(rawPayload, notificationQueue, isAllEvents),
      Effect.catchAll((error) =>
        Effect.logError(`Failed to process notification for ${channelName}`, {
          error,
        })
      )
    );

const handleUnlessProbe =
  (
    probe: string,
    active: Deferred.Deferred<void, SqlError.SqlError>,
    handleNotification: (rawPayload: string) => Effect.Effect<void>
  ) =>
  (rawPayload: string) =>
    pipe(
      rawPayload,
      Match.value,
      Match.when(probe, () => Deferred.succeed(active, undefined)),
      Match.when(
        (payload) => payload.startsWith(LISTEN_PROBE_PREFIX),
        () => Effect.void
      ),
      Match.orElse(handleNotification),
      Effect.asVoid
    );

const sendProbeUntilActive = (
  client: PgClient.PgClient,
  channelName: string,
  probe: string,
  active: Deferred.Deferred<void, SqlError.SqlError>
) =>
  pipe(
    // Not client.notify: @effect/sql-pg 0.53 sends `NOTIFY channel, $1`, which Postgres rejects.
    client`SELECT pg_notify(${channelName}, ${probe})`,
    Effect.repeat(Schedule.spaced(LISTEN_PROBE_INTERVAL)),
    Effect.raceFirst(Deferred.await(active))
  );

const receiveNotifications = (
  client: PgClient.PgClient,
  channelName: string,
  probe: string,
  active: Deferred.Deferred<void, SqlError.SqlError>,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) =>
  pipe(
    channelName,
    client.listen,
    Stream.runForEach(handleUnlessProbe(probe, active, handleNotification))
  );

const createNotificationsStream = (
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>
) =>
  pipe(
    notificationQueue,
    Queue.take,
    Stream.repeatEffect,
    Stream.mapError(eventStoreError.read(undefined, 'Failed to read notification queue'))
  );

const startListenerService = pipe(
  'PostgreSQL notification listener started with LISTEN/NOTIFY support',
  Effect.logInfo,
  Effect.asVoid
);

const parseStreamIdFromPayload = (payload: NotificationPayload) =>
  pipe(
    payload.stream_id,
    Schema.decode(EventStreamId),
    Effect.mapError(eventStoreError.read(undefined, 'Failed to parse stream_id from notification'))
  );

const queueParsedNotification = (
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  payload: NotificationPayload,
  streamId: EventStreamId,
  isAllEvents: boolean
) =>
  Queue.offer(notificationQueue, {
    streamId,
    payload,
    isAllEvents,
  });

const parseAndQueue =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>,
    isAllEvents: boolean
  ) =>
  (payload: NotificationPayload) =>
    pipe(
      payload,
      parseStreamIdFromPayload,
      Effect.flatMap((streamId) =>
        queueParsedNotification(notificationQueue, payload, streamId, isAllEvents)
      )
    );

const processAllEventsNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>
  ) =>
  (rawPayload: string) =>
    pipe(
      rawPayload,
      parseNotificationPayload,
      Effect.flatMap(parseAndQueue(notificationQueue, true)),
      Effect.catchAll((error) =>
        Effect.logError(`Failed to process all-events notification`, { error })
      )
    );

const notificationHandlerFor = (
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  channelName: string
) =>
  pipe(
    channelName,
    Match.value,
    Match.when(ALL_EVENTS_CHANNEL, () => processAllEventsNotification(notificationQueue)),
    Match.orElse(() => processRawNotification(notificationQueue, channelName, false))
  );

const forkReceiverInScope = (
  client: PgClient.PgClient,
  channelName: string,
  probe: string,
  active: Deferred.Deferred<void, SqlError.SqlError>,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) =>
  pipe(
    receiveNotifications(client, channelName, probe, active, handleNotification),
    Effect.tapError((error) => Deferred.fail(active, error)),
    Effect.ensuring(Deferred.interrupt(active)),
    Effect.forkScoped
  );

/**
 * Starts LISTEN on a channel for as long as the channel's RcMap entry is held, and
 * returns once LISTEN is active.
 */
const startChannelListener =
  (
    client: PgClient.PgClient,
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>
  ) =>
  (channelName: string) => {
    const probe = `${LISTEN_PROBE_PREFIX}${crypto.randomUUID()}`;
    const handleNotification = notificationHandlerFor(notificationQueue, channelName);
    return pipe(
      Deferred.make<void, SqlError.SqlError>(),
      Effect.tap((active) =>
        forkReceiverInScope(client, channelName, probe, active, handleNotification)
      ),
      Effect.flatMap((active) => sendProbeUntilActive(client, channelName, probe, active)),
      Effect.asVoid
    );
  };

type ListeningChannels = RcMap.RcMap<string, void, SqlError.SqlError>;

const holdChannel = (
  channels: ListeningChannels,
  channelName: string,
  held: Deferred.Deferred<void, SqlError.SqlError>
) =>
  pipe(
    channels,
    RcMap.get(channelName),
    Effect.andThen(Deferred.succeed(held, undefined)),
    Effect.andThen(Effect.never),
    Effect.scoped,
    Effect.tapError((error) => Deferred.fail(held, error)),
    Effect.ensuring(Deferred.interrupt(held))
  );

/**
 * Holds the channel's LISTEN for as long as the calling fiber runs, and returns once
 * LISTEN is active, so that no notification sent after this returns can be missed.
 * Callers on one channel share its LISTEN, so each notification is handled once.
 */
const listenWhileCallerRuns = (channels: ListeningChannels, channelName: string) =>
  pipe(
    Deferred.make<void, SqlError.SqlError>(),
    Effect.tap((held) => Effect.fork(holdChannel(channels, channelName, held))),
    Effect.flatMap(Deferred.await)
  );

const startListenForStream = (channels: ListeningChannels) => (streamId: EventStreamId) =>
  pipe(
    listenWhileCallerRuns(channels, makeChannelName(streamId)),
    Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to listen to stream'))
  );

const buildNotificationListener = ({
  channels,
  notificationQueue,
}: {
  readonly channels: ListeningChannels;
  readonly notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>;
}) => ({
  listen: startListenForStream(channels),

  listenAll: pipe(
    listenWhileCallerRuns(channels, ALL_EVENTS_CHANNEL),
    Effect.mapError(eventStoreError.subscribe('*', 'Failed to listen to all events'))
  ),

  // A LISTEN ends when the last fiber that asked for it ends. These do not end one sooner.
  unlisten: (_streamId: EventStreamId) => Effect.void,

  unlistenAll: Effect.void,

  notifications: createNotificationsStream(notificationQueue),

  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Module-level Effect used once as service property
  start: startListenerService,

  stop: Effect.logInfo('PostgreSQL notification listener stopped'),
});

const makeNotificationListener = ({
  client,
  notificationQueue,
}: {
  readonly client: PgClient.PgClient;
  readonly notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>;
}) =>
  Effect.map(RcMap.make({ lookup: startChannelListener(client, notificationQueue) }), (channels) =>
    buildNotificationListener({ channels, notificationQueue })
  );

const createNotificationListenerDependencies = {
  client: PgClient.PgClient,
  notificationQueue: Queue.unbounded<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>(),
};

export const NotificationListenerLive = Layer.scoped(
  NotificationListener,
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
  pipe(Effect.all(createNotificationListenerDependencies), Effect.flatMap(makeNotificationListener))
);
