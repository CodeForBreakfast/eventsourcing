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

const logListenerStarted = Effect.logInfo(
  'PostgreSQL notification listener started with LISTEN/NOTIFY support'
);

const startListenerService = pipe(logListenerStarted, Effect.asVoid);

const clearActiveChannels = Ref.set(HashSet.empty<string>());

const logListenerStopped = Effect.logInfo('PostgreSQL notification listener stopped');

const stopListenerService = (activeChannels: Ref.Ref<HashSet.HashSet<string>>) =>
  pipe(
    logListenerStopped,
    Effect.andThen(Ref.get(activeChannels)),
    Effect.flatMap((channels) =>
      Effect.forEach(Array.from(channels), (channelName) =>
        Effect.logDebug(`Cleaning up channel: ${channelName}`)
      )
    ),
    Effect.andThen(clearActiveChannels(activeChannels)),
    Effect.asVoid
  );

const createNotificationListenerDependencies = Effect.all({
  client: PgClient.PgClient,
  activeChannels: Ref.make(HashSet.empty<string>()),
  notificationQueue: Queue.unbounded<{
    readonly streamId: EventStreamId;
    readonly payload: NotificationPayload;
  }>(),
});

export const NotificationListenerLive = Layer.effect(
  NotificationListener,
  pipe(
    createNotificationListenerDependencies,
    Effect.map(({ client, activeChannels, notificationQueue }) => ({
      listen: startListenForStream(activeChannels, client, notificationQueue),

      unlisten: stopListenForStream(activeChannels),

      notifications: createNotificationsStream(notificationQueue),

      start: startListenerService,

      stop: stopListenerService(activeChannels),
    }))
  )
);
