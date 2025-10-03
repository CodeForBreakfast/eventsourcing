import { PgClient } from '@effect/sql-pg';
import { Effect, Layer, Stream, Ref, Queue, Schema, HashSet } from 'effect';
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
const parseNotificationPayload = (
  jsonString: string
): Effect.Effect<NotificationPayload, EventStoreError, never> =>
  Effect.try({
    try: () => JSON.parse(jsonString) as NotificationPayload,
    catch: (error) =>
      eventStoreError.read(
        undefined,
        `Failed to parse notification payload: ${String(error)}`,
        error
      ),
  }).pipe(
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(
        Schema.Struct({
          stream_id: Schema.String,
          event_number: Schema.Number,
          event_payload: Schema.String,
        })
      )(payload)
    ),
    Effect.mapError((error) =>
      eventStoreError.read(
        undefined,
        `Failed to validate notification payload schema: ${String(error)}`,
        error
      )
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
    Queue.offer(notificationQueue, {
      streamId,
      payload,
    }).pipe(Effect.tap(() => Effect.logDebug(`Queued notification for stream ${streamId}`)));

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
    Effect.logDebug(`Received raw notification on ${channelName}: ${rawPayload}`).pipe(
      Effect.flatMap(() => parseNotificationPayload(rawPayload)),
      Effect.flatMap(queueNotification(notificationQueue, streamId)),
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
  client
    .listen(channelName)
    .pipe(
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
  Ref.update(activeChannels, HashSet.add(channelName)).pipe(
    Effect.flatMap(() =>
      Effect.logDebug(`Successfully started listening on channel: ${channelName}`)
    ),
    Effect.tap(() => startListeningOnChannel(client, notificationQueue, streamId, channelName))
  );

export const NotificationListenerLive = Layer.effect(
  NotificationListener,
  Effect.all({
    client: PgClient.PgClient,
    activeChannels: Ref.make(HashSet.empty<string>()),
    notificationQueue: Queue.unbounded<{
      readonly streamId: EventStreamId;
      readonly payload: NotificationPayload;
    }>(),
  }).pipe(
    Effect.map(({ client, activeChannels, notificationQueue }) => ({
      listen: (streamId: EventStreamId): Effect.Effect<void, EventStoreError, never> =>
        Effect.logDebug(`Starting LISTEN for stream: ${streamId}`).pipe(
          Effect.flatMap(() => {
            const channelName = makeChannelName(streamId);
            return activateChannelAndStartListening(
              activeChannels,
              client,
              notificationQueue,
              streamId,
              channelName
            );
          }),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to listen to stream: ${String(error)}`,
              error
            )
          )
        ),

      unlisten: (streamId: EventStreamId): Effect.Effect<void, EventStoreError, never> =>
        Effect.logDebug(`Stopping LISTEN for stream: ${streamId}`).pipe(
          Effect.flatMap(() => {
            const channelName = makeChannelName(streamId);
            return Ref.update(activeChannels, HashSet.remove(channelName)).pipe(Effect.asVoid);
          }),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to unlisten from stream: ${String(error)}`,
              error
            )
          )
        ),

      notifications: Queue.take(notificationQueue).pipe(
        Stream.repeatEffect,
        Stream.mapError((error) =>
          eventStoreError.read(
            undefined,
            `Failed to read notification queue: ${String(error)}`,
            error
          )
        )
      ),

      start: Effect.logInfo(
        'PostgreSQL notification listener started with LISTEN/NOTIFY support'
      ).pipe(Effect.asVoid),

      stop: Effect.logInfo('PostgreSQL notification listener stopped').pipe(
        Effect.flatMap(() => Ref.get(activeChannels)),
        Effect.flatMap((channels) =>
          Effect.forEach(Array.from(channels), (channelName) =>
            Effect.logDebug(`Cleaning up channel: ${channelName}`)
          )
        ),
        Effect.flatMap(() => Ref.set(activeChannels, HashSet.empty())),
        Effect.asVoid
      ),
    }))
  )
);
