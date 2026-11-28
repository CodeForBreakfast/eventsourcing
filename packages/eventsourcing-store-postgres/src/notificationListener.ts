import { SqlError } from '@effect/sql';
import { PgClient } from '@effect/sql-pg';
import {
  Deferred,
  Effect,
  Layer,
  Match,
  Stream,
  HashMap,
  Option,
  Queue,
  Schedule,
  Schema,
  Scope,
  SynchronizedRef,
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

/**
 * The LISTEN running on each channel, keyed by channel name, with the Deferred that
 * completes once that LISTEN is active.
 */
type ListeningChannels = SynchronizedRef.SynchronizedRef<
  HashMap.HashMap<string, Deferred.Deferred<void, SqlError.SqlError>>
>;

const forgetChannel = (
  channels: ListeningChannels,
  channelName: string,
  active: Deferred.Deferred<void, SqlError.SqlError>
) =>
  SynchronizedRef.update(channels, (listening) =>
    pipe(
      HashMap.get(listening, channelName),
      Option.filter((registered) => registered === active),
      Option.match({
        onNone: () => listening,
        onSome: () => HashMap.remove(listening, channelName),
      })
    )
  );

const releaseChannel = (
  channels: ListeningChannels,
  channelName: string,
  active: Deferred.Deferred<void, SqlError.SqlError>
) => Effect.andThen(Deferred.interrupt(active), forgetChannel(channels, channelName, active));

/**
 * Receives a channel's notifications for as long as the listener's scope is open, and
 * completes `active` once LISTEN is active. When it stops, the channel is forgotten so
 * that the next caller starts LISTEN again.
 */
const runChannelListener = (
  client: PgClient.PgClient,
  channels: ListeningChannels,
  channelName: string,
  active: Deferred.Deferred<void, SqlError.SqlError>,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) => {
  const probe = `${LISTEN_PROBE_PREFIX}${crypto.randomUUID()}`;
  return pipe(
    receiveNotifications(client, channelName, probe, active, handleNotification),
    Effect.zip(sendProbeUntilActive(client, channelName, probe, active), { concurrent: true }),
    Effect.tapError((error) => Deferred.fail(active, error)),
    Effect.ensuring(releaseChannel(channels, channelName, active))
  );
};

const startChannelListener = (
  scope: Scope.Scope,
  client: PgClient.PgClient,
  channels: ListeningChannels,
  channelName: string,
  handleNotification: (rawPayload: string) => Effect.Effect<void>,
  listening: HashMap.HashMap<string, Deferred.Deferred<void, SqlError.SqlError>>
) =>
  pipe(
    Deferred.make<void, SqlError.SqlError>(),
    Effect.tap((active) =>
      Effect.forkIn(
        runChannelListener(client, channels, channelName, active, handleNotification),
        scope
      )
    ),
    Effect.map((active) => [active, HashMap.set(listening, channelName, active)] as const)
  );

const joinOrStartChannelListener =
  (
    scope: Scope.Scope,
    client: PgClient.PgClient,
    channels: ListeningChannels,
    channelName: string,
    handleNotification: (rawPayload: string) => Effect.Effect<void>
  ) =>
  (listening: HashMap.HashMap<string, Deferred.Deferred<void, SqlError.SqlError>>) =>
    pipe(
      listening,
      HashMap.get(channelName),
      Option.match({
        onNone: () =>
          startChannelListener(scope, client, channels, channelName, handleNotification, listening),
        onSome: (active) => Effect.succeed([active, listening] as const),
      })
    );

/**
 * Makes sure one LISTEN runs on the channel and waits until it is active, so that no
 * notification sent after this returns can be missed. Callers on a channel that is
 * already listening share its LISTEN, so each notification is handled once.
 */
const listenOnceUntilActive = (
  scope: Scope.Scope,
  client: PgClient.PgClient,
  channels: ListeningChannels,
  channelName: string,
  handleNotification: (rawPayload: string) => Effect.Effect<void>
) =>
  pipe(
    channels,
    SynchronizedRef.modifyEffect(
      joinOrStartChannelListener(scope, client, channels, channelName, handleNotification)
    ),
    Effect.flatMap(Deferred.await)
  );

const startListenForStream =
  (
    scope: Scope.Scope,
    client: PgClient.PgClient,
    channels: ListeningChannels,
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
      readonly isAllEvents: boolean;
    }>
  ) =>
  (streamId: EventStreamId) => {
    const channelName = makeChannelName(streamId);
    return pipe(
      listenOnceUntilActive(
        scope,
        client,
        channels,
        channelName,
        processRawNotification(notificationQueue, channelName, false)
      ),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to listen to stream'))
    );
  };

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

const listenAllEvents = (
  scope: Scope.Scope,
  client: PgClient.PgClient,
  channels: ListeningChannels,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>
) =>
  pipe(
    listenOnceUntilActive(
      scope,
      client,
      channels,
      ALL_EVENTS_CHANNEL,
      processAllEventsNotification(notificationQueue)
    ),
    Effect.mapError(eventStoreError.subscribe('*', 'Failed to listen to all events'))
  );

const buildNotificationListener = ({
  scope,
  client,
  channels,
  notificationQueue,
}: {
  readonly scope: Scope.Scope;
  readonly client: PgClient.PgClient;
  readonly channels: ListeningChannels;
  readonly notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>;
}) => ({
  listen: startListenForStream(scope, client, channels, notificationQueue),

  listenAll: listenAllEvents(scope, client, channels, notificationQueue),

  // A LISTEN runs until the listener's scope closes. Its channel stays registered
  // meanwhile, so that a later listen shares it rather than starting a second one.
  unlisten: (_streamId: EventStreamId) => Effect.void,

  unlistenAll: Effect.void,

  notifications: createNotificationsStream(notificationQueue),

  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Module-level Effect used once as service property
  start: startListenerService,

  stop: Effect.logInfo('PostgreSQL notification listener stopped'),
});

const createNotificationListenerDependencies = {
  scope: Effect.scope,
  client: PgClient.PgClient,
  channels: SynchronizedRef.make(
    HashMap.empty<string, Deferred.Deferred<void, SqlError.SqlError>>()
  ),
  notificationQueue: Queue.unbounded<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
    readonly isAllEvents: boolean;
  }>(),
};

export const NotificationListenerLive = Layer.scoped(
  NotificationListener,
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
  pipe(Effect.all(createNotificationListenerDependencies), Effect.map(buildNotificationListener))
);
