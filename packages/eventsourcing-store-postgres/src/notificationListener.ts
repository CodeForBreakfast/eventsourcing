import { SqlError } from '@effect/sql';
import { PgClient } from '@effect/sql-pg';
import {
  Deferred,
  Effect,
  Layer,
  Match,
  Stream,
  Ref,
  Queue,
  Schedule,
  Schema,
  HashSet,
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

const listenInBackground = (
  client: PgClient.PgClient,
  channelName: string,
  probe: string,
  active: Deferred.Deferred<void, SqlError.SqlError>,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) =>
  pipe(
    channelName,
    client.listen,
    Stream.runForEach(handleUnlessProbe(probe, active, handleNotification)),
    Effect.tapError((error) => Deferred.fail(active, error)),
    Effect.fork
  );

/**
 * Starts listening on a channel in the background and waits until LISTEN is active,
 * so that no notification sent after this returns can be missed.
 */
const listenUntilActive = (
  client: PgClient.PgClient,
  channelName: string,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) =>
  pipe(
    Deferred.make<void, SqlError.SqlError>(),
    Effect.flatMap((active) => {
      const probe = `${LISTEN_PROBE_PREFIX}${crypto.randomUUID()}`;
      return Effect.andThen(
        listenInBackground(client, channelName, probe, active, handleNotification),
        sendProbeUntilActive(client, channelName, probe, active)
      );
    })
  );

const startListeningOnChannel = (
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  channelName: string
) =>
  listenUntilActive(
    client,
    channelName,
    processRawNotification(notificationQueue, channelName, false)
  );

const activateChannelAndStartListening = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  channelName: string
) =>
  pipe(
    Ref.update(activeChannels, HashSet.add(channelName)),
    Effect.tap(() => startListeningOnChannel(client, notificationQueue, channelName))
  );

const activateAndListen = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>,
  streamId: EventStreamId
) => {
  const channelName = makeChannelName(streamId);
  return activateChannelAndStartListening(activeChannels, client, notificationQueue, channelName);
};

const startListenForStream =
  (
    activeChannels: Ref.Ref<HashSet.HashSet<string>>,
    client: PgClient.PgClient,
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>
  ) =>
  (streamId: EventStreamId) =>
    pipe(
      activateAndListen(activeChannels, client, notificationQueue, streamId),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to listen to stream'))
    );

const removeChannelFromActive = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  channelName: string
) => pipe(activeChannels, Ref.update(HashSet.remove(channelName)), Effect.asVoid);

const removeChannelForStream = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  streamId: EventStreamId
) => {
  const channelName = makeChannelName(streamId);
  return removeChannelFromActive(activeChannels, channelName);
};

const stopListenForStream =
  (activeChannels: Ref.Ref<HashSet.HashSet<string>>) => (streamId: EventStreamId) =>
    pipe(
      removeChannelForStream(activeChannels, streamId),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to unlisten from stream'))
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

const clearActiveChannels = Ref.set(HashSet.empty<string>());

const stopListenerService = (activeChannels: Ref.Ref<HashSet.HashSet<string>>) =>
  pipe(
    'PostgreSQL notification listener stopped',
    Effect.logInfo,
    Effect.andThen(clearActiveChannels(activeChannels)),
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

const startListeningOnAllEventsChannel = (
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>
) => listenUntilActive(client, ALL_EVENTS_CHANNEL, processAllEventsNotification(notificationQueue));

const activateAllEventsChannel = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>
) =>
  pipe(
    Ref.update(activeChannels, HashSet.add(ALL_EVENTS_CHANNEL)),
    Effect.tap(() => startListeningOnAllEventsChannel(client, notificationQueue))
  );

const listenAllEvents = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>
) =>
  pipe(
    activeChannels,
    Ref.get,
    Effect.flatMap((channels) =>
      Effect.if(HashSet.has(channels, ALL_EVENTS_CHANNEL), {
        onTrue: () => Effect.succeed(undefined),
        onFalse: () => activateAllEventsChannel(activeChannels, client, notificationQueue),
      })
    ),
    Effect.mapError(eventStoreError.subscribe('*', 'Failed to listen to all events'))
  );

const unlistenAllEvents = (activeChannels: Ref.Ref<HashSet.HashSet<string>>) =>
  pipe(
    removeChannelFromActive(activeChannels, ALL_EVENTS_CHANNEL),
    Effect.mapError(eventStoreError.subscribe('*', 'Failed to unlisten from all events'))
  );

const buildNotificationListener = ({
  client,
  activeChannels,
  notificationQueue,
}: {
  readonly client: PgClient.PgClient;
  readonly activeChannels: Ref.Ref<HashSet.HashSet<string>>;
  readonly notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>;
}) => ({
  listen: startListenForStream(activeChannels, client, notificationQueue),

  unlisten: stopListenForStream(activeChannels),

  listenAll: listenAllEvents(activeChannels, client, notificationQueue),

  unlistenAll: unlistenAllEvents(activeChannels),

  notifications: createNotificationsStream(notificationQueue),

  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Module-level Effect used once as service property
  start: startListenerService,

  stop: stopListenerService(activeChannels),
});

const createNotificationListenerDependencies = {
  client: PgClient.PgClient,
  activeChannels: Ref.make(HashSet.empty<string>()),
  notificationQueue: Queue.unbounded<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>(),
};

export const NotificationListenerLive = Layer.effect(
  NotificationListener,
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
  pipe(Effect.all(createNotificationListenerDependencies), Effect.map(buildNotificationListener))
);
