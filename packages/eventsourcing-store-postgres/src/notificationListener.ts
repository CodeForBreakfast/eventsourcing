import { PgClient } from '@effect/sql-pg';
import { Effect, Layer, Stream, Ref, Queue, Schema, HashSet, pipe } from 'effect';
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
      { readonly streamId: EventStreamId; readonly payload: NotificationPayload },
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
const queueNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>,
    streamId: EventStreamId
  ) =>
  (payload: NotificationPayload) =>
    pipe(
      Queue.offer(notificationQueue, {
        streamId,
        payload,
      }),
      Effect.tap(() => Effect.logDebug(`Queued notification for stream ${streamId}`))
    );

const parseAndQueueNotification = (
  rawPayload: string,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>,
  streamId: EventStreamId
) =>
  pipe(
    rawPayload,
    parseNotificationPayload,
    Effect.flatMap(queueNotification(notificationQueue, streamId))
  );

const logReceivedNotification = (channelName: string, rawPayload: string) =>
  Effect.logDebug(`Received raw notification on ${channelName}: ${rawPayload}`);

const processRawNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>,
    streamId: EventStreamId,
    channelName: string
  ) =>
  (rawPayload: string) =>
    pipe(
      logReceivedNotification(channelName, rawPayload),
      Effect.andThen(parseAndQueueNotification(rawPayload, notificationQueue, streamId)),
      Effect.catchAll((error) =>
        Effect.logError(`Failed to process notification for ${channelName}`, {
          error,
        })
      )
    );

const startListeningOnChannel = (
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>,
  streamId: EventStreamId,
  channelName: string
) =>
  pipe(
    channelName,
    client.listen,
    Stream.tap(processRawNotification(notificationQueue, streamId, channelName)),
    Stream.runDrain,
    Effect.fork,
    Effect.asVoid
  );

const activateChannelAndStartListening = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>,
  streamId: EventStreamId,
  channelName: string
) =>
  pipe(
    activeChannels,
    Ref.update(HashSet.add(channelName)),
    Effect.andThen(Effect.logDebug(`Successfully started listening on channel: ${channelName}`)),
    Effect.tap(() => startListeningOnChannel(client, notificationQueue, streamId, channelName))
  );

const activateAndListen = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>,
  streamId: EventStreamId
) => {
  const channelName = makeChannelName(streamId);
  return activateChannelAndStartListening(
    activeChannels,
    client,
    notificationQueue,
    streamId,
    channelName
  );
};

const logStartListen = (streamId: EventStreamId) =>
  Effect.logDebug(`Starting LISTEN for stream: ${streamId}`);

const startListenForStream =
  (
    activeChannels: Ref.Ref<HashSet.HashSet<string>>,
    client: PgClient.PgClient,
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>
  ) =>
  (streamId: EventStreamId) =>
    pipe(
      streamId,
      logStartListen,
      Effect.andThen(activateAndListen(activeChannels, client, notificationQueue, streamId)),
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

const logStopListen = (streamId: EventStreamId) =>
  Effect.logDebug(`Stopping LISTEN for stream: ${streamId}`);

const stopListenForStream =
  (activeChannels: Ref.Ref<HashSet.HashSet<string>>) => (streamId: EventStreamId) =>
    pipe(
      streamId,
      logStopListen,
      Effect.andThen(removeChannelForStream(activeChannels, streamId)),
      Effect.mapError(eventStoreError.subscribe(streamId, 'Failed to unlisten from stream'))
    );

const createNotificationsStream = (
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
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
    Effect.andThen(Ref.get(activeChannels)),
    Effect.flatMap((channels) =>
      Effect.forEach(Array.from(channels), (channelName) =>
        Effect.logDebug(`Cleaning up channel: ${channelName}`)
      )
    ),
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
  }>,
  payload: NotificationPayload,
  streamId: EventStreamId
) =>
  pipe(
    Queue.offer(notificationQueue, {
      streamId,
      payload,
    }),
    Effect.tap(() => Effect.logDebug(`Queued notification for stream ${streamId}`))
  );

const parseAndQueue =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>
  ) =>
  (payload: NotificationPayload) =>
    pipe(
      payload,
      parseStreamIdFromPayload,
      Effect.flatMap((streamId) => queueParsedNotification(notificationQueue, payload, streamId))
    );

const processAllEventsNotification =
  (
    notificationQueue: Queue.Queue<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>,
    channelName: string
  ) =>
  (rawPayload: string) =>
    pipe(
      logReceivedNotification(channelName, rawPayload),
      Effect.andThen(parseNotificationPayload(rawPayload)),
      Effect.flatMap(parseAndQueue(notificationQueue)),
      Effect.catchAll((error) =>
        Effect.logError(`Failed to process all-events notification`, { error })
      )
    );

const startListeningOnAllEventsChannel = (
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>
) =>
  pipe(
    ALL_EVENTS_CHANNEL,
    client.listen,
    Stream.tap(processAllEventsNotification(notificationQueue, ALL_EVENTS_CHANNEL)),
    Stream.runDrain,
    Effect.fork,
    Effect.asVoid
  );

const activateAllEventsChannel = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>
) =>
  pipe(
    Ref.update(activeChannels, HashSet.add(ALL_EVENTS_CHANNEL)),
    Effect.andThen(Effect.logDebug(`Successfully started listening on: ${ALL_EVENTS_CHANNEL}`)),
    Effect.tap(() => startListeningOnAllEventsChannel(client, notificationQueue))
  );

const startListeningIfNotActive = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>
) =>
  pipe(
    ALL_EVENTS_CHANNEL,
    (channel) => Effect.logDebug(`Starting LISTEN on global channel: ${channel}`),
    Effect.andThen(activateAllEventsChannel(activeChannels, client, notificationQueue))
  );

const listenAllEvents = (
  activeChannels: Ref.Ref<HashSet.HashSet<string>>,
  client: PgClient.PgClient,
  notificationQueue: Queue.Queue<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>
) =>
  pipe(
    activeChannels,
    Ref.get,
    Effect.flatMap((channels) =>
      Effect.if(HashSet.has(channels, ALL_EVENTS_CHANNEL), {
        onTrue: () => Effect.logDebug(`Already listening on global channel: ${ALL_EVENTS_CHANNEL}`),
        onFalse: () => startListeningIfNotActive(activeChannels, client, notificationQueue),
      })
    ),
    Effect.mapError(eventStoreError.subscribe('*', 'Failed to listen to all events'))
  );

const unlistenAllEvents = (activeChannels: Ref.Ref<HashSet.HashSet<string>>) =>
  pipe(
    ALL_EVENTS_CHANNEL,
    (channel) => Effect.logDebug(`Stopping LISTEN on global channel: ${channel}`),
    Effect.andThen(removeChannelFromActive(activeChannels, ALL_EVENTS_CHANNEL)),
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
  }>(),
};

export const NotificationListenerLive = Layer.effect(
  NotificationListener,
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Effect.all needs an object argument, cannot be piped differently
  pipe(Effect.all(createNotificationListenerDependencies), Effect.map(buildNotificationListener))
);
