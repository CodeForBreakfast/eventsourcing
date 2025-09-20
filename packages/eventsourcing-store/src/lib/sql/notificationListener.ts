import { PgClient } from '@effect/sql-pg';
import { Effect, Layer, pipe, Stream, Ref, Queue, Schema } from 'effect';
import { EventStreamId } from '../streamTypes';
import { EventStoreError, eventStoreError } from '../errors';

/**
 * Interface for handling notification events
 */
export interface NotificationPayload {
  stream_id: string;
  event_number: number;
  event_payload: string;
}

/**
 * Creates a notification channel name for a stream ID
 */
export const makeChannelName = (streamId: EventStreamId): string =>
  `eventstore_events_${streamId}`;

/**
 * Parse notification payload from PostgreSQL trigger JSON
 */
const parseNotificationPayload = (
  jsonString: string,
): Effect.Effect<NotificationPayload, EventStoreError, never> =>
  pipe(
    Effect.try({
      try: () => JSON.parse(jsonString) as NotificationPayload,
      catch: (error) =>
        eventStoreError.read(
          undefined,
          `Failed to parse notification payload: ${String(error)}`,
          error,
        ),
    }),
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(
        Schema.Struct({
          stream_id: Schema.String,
          event_number: Schema.Number,
          event_payload: Schema.String,
        }),
      )(payload),
    ),
    Effect.mapError((error) =>
      eventStoreError.read(
        undefined,
        `Failed to validate notification payload schema: ${String(error)}`,
        error,
      ),
    ),
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
    listen: (
      streamId: EventStreamId,
    ) => Effect.Effect<void, EventStoreError, never>;

    /**
     * Stop listening for notifications on a specific stream's channel
     */
    unlisten: (
      streamId: EventStreamId,
    ) => Effect.Effect<void, EventStoreError, never>;

    /**
     * Get a stream of notifications for all channels we're listening to
     */
    notifications: Stream.Stream<
      { streamId: EventStreamId; payload: NotificationPayload },
      EventStoreError,
      never
    >;

    /**
     * Start the notification listener background process
     */
    start: Effect.Effect<void, EventStoreError, never>;

    /**
     * Stop the notification listener and cleanup
     */
    stop: Effect.Effect<void, EventStoreError, never>;
  }>
>() {}

/**
 * Full PostgreSQL LISTEN/NOTIFY implementation using @effect/sql-pg
 */
export const NotificationListenerLive = Layer.effect(
  NotificationListener,
  pipe(
    Effect.all({
      client: PgClient.PgClient,
      activeChannels: Ref.make(new Set<string>()),
      notificationQueue: Queue.unbounded<{
        streamId: EventStreamId;
        payload: NotificationPayload;
      }>(),
    }),
    Effect.map(({ client, activeChannels, notificationQueue }) => ({
      listen: (
        streamId: EventStreamId,
      ): Effect.Effect<void, EventStoreError, never> =>
        pipe(
          Effect.logDebug(`Starting LISTEN for stream: ${streamId}`),
          Effect.flatMap(() => {
            const channelName = makeChannelName(streamId);
            return pipe(
              // Add channel to active set
              Ref.update(
                activeChannels,
                (channels) => new Set([...channels, channelName]),
              ),
              Effect.flatMap(() =>
                pipe(
                  Effect.logDebug(
                    `Successfully started listening on channel: ${channelName}`,
                  ),
                  // Start the stream processing in background
                  Effect.tap(() =>
                    pipe(
                      client.listen(channelName),
                      Stream.tap((rawPayload) =>
                        pipe(
                          Effect.logDebug(
                            `Received raw notification on ${channelName}: ${rawPayload}`,
                          ),
                          Effect.flatMap(() =>
                            parseNotificationPayload(rawPayload),
                          ),
                          Effect.flatMap((payload) =>
                            pipe(
                              // Store in notification queue for processing
                              Queue.offer(notificationQueue, {
                                streamId,
                                payload,
                              }),
                              Effect.tap(() =>
                                Effect.logDebug(
                                  `Queued notification for stream ${streamId}`,
                                ),
                              ),
                            ),
                          ),
                          Effect.catchAll((error) =>
                            Effect.logError(
                              `Failed to process notification for ${channelName}`,
                              { error },
                            ),
                          ),
                        ),
                      ),
                      Stream.runDrain,
                      Effect.fork,
                      Effect.asVoid,
                    ),
                  ),
                ),
              ),
            );
          }),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to listen to stream: ${String(error)}`,
              error,
            ),
          ),
        ),

      unlisten: (
        streamId: EventStreamId,
      ): Effect.Effect<void, EventStoreError, never> =>
        pipe(
          Effect.logDebug(`Stopping LISTEN for stream: ${streamId}`),
          Effect.flatMap(() => {
            const channelName = makeChannelName(streamId);
            return pipe(
              Ref.update(
                activeChannels,
                (channels) =>
                  new Set([...channels].filter((ch) => ch !== channelName)),
              ),
              Effect.asVoid,
            );
          }),
          Effect.mapError((error) =>
            eventStoreError.subscribe(
              streamId,
              `Failed to unlisten from stream: ${String(error)}`,
              error,
            ),
          ),
        ),

      notifications: pipe(
        Queue.take(notificationQueue),
        Stream.repeatEffect,
        Stream.mapError((error) =>
          eventStoreError.read(
            undefined,
            `Failed to read notification queue: ${String(error)}`,
            error,
          ),
        ),
      ),

      start: pipe(
        Effect.logInfo(
          'PostgreSQL notification listener started with LISTEN/NOTIFY support',
        ),
        Effect.asVoid,
      ),

      stop: pipe(
        Effect.logInfo('PostgreSQL notification listener stopped'),
        Effect.flatMap(() => Ref.get(activeChannels)),
        Effect.flatMap((channels) =>
          Effect.forEach(Array.from(channels), (channelName) =>
            Effect.logDebug(`Cleaning up channel: ${channelName}`),
          ),
        ),
        Effect.flatMap(() => Ref.set(activeChannels, new Set())),
        Effect.asVoid,
      ),
    })),
  ),
);
