import { Data, Effect, Layer, PubSub, Queue, Stream, Scope, pipe, Ref, Context } from 'effect';
import type { ReadonlyDeep } from 'type-fest';

// For ESLint prefer-immutable-types compliance with Effect types
// We use a minimal readonly wrapper that doesn't break Effect's type system

/**
 * Error that occurs when streaming operations fail
 */
export class StreamingError extends Data.TaggedError('StreamingError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Interface for event streaming
 */
export interface StreamHandlerService<TEvent, TStreamId extends string = string> {
  /**
   * Subscribe to events for a specific stream
   */
  readonly subscribeToStream: (
    streamId: TStreamId
  ) => Effect.Effect<Stream.Stream<TEvent, StreamingError>, StreamingError, Scope.Scope>;

  /**
   * Publish an event to subscribers
   */
  readonly publishToStream: (
    streamId: TStreamId,
    event: TEvent
  ) => Effect.Effect<void, StreamingError, never>;

  /**
   * Get metrics about current stream subscribers
   */
  readonly getStreamMetrics: () => Effect.Effect<
    {
      readonly activeStreams: number;
      readonly totalEventsProcessed: number;
    },
    never,
    never
  >;
}

/**
 * Create a Stream service tag factory
 * Note: Using Context.GenericTag here because Effect.Tag doesn't support generic parameters
 * This is a valid use case for GenericTag with complex generic types
 */
export const StreamHandler = <TEvent = unknown, TStreamId extends string = string>() =>
  Context.GenericTag<StreamHandlerService<TEvent, TStreamId>>('StreamHandler');

/**
 * Create the stream handler with Effect's PubSub
 */
export const makeStreamHandler = <TEvent, TStreamId extends string = string>() =>
  pipe(
    // Create references to our handler state
    Effect.all([Ref.make(new Map<string, PubSub.PubSub<TEvent>>()), Ref.make(0)]),
    Effect.map(([channelsRef, eventsCounter]) => {
      // Helper to get or create a channel for a stream
      const getOrCreateChannel = (streamId: TStreamId) => {
        const key = String(streamId);

        return pipe(
          Ref.get(channelsRef),

          Effect.flatMap((channels: ReadonlyMap<string, PubSub.PubSub<TEvent>>) => {
            if (channels.has(key)) {
              const channel = channels.get(key);
              if (channel) {
                return Effect.succeed(channel);
              }
            }

            // Create the channel and then update the map in two separate steps
            return pipe(
              PubSub.unbounded<TEvent>(),

              Effect.flatMap((channel: PubSub.PubSub<TEvent>) => {
                // First, update the map by adding the channel
                return pipe(
                  channelsRef,

                  Ref.update((channels: ReadonlyMap<string, PubSub.PubSub<TEvent>>) => {
                    // Create a new map with the added channel using immutable operations
                    return new Map<string, PubSub.PubSub<TEvent>>([
                      ...channels.entries(),
                      [key, channel],
                    ]);
                  }),
                  // Then return the channel
                  Effect.as(channel)
                );
              })
            );
          })
        );
      };

      // Create the handler implementation
      const handler: StreamHandlerService<TEvent, TStreamId> = {
        subscribeToStream: (streamId) =>
          Effect.catchAll(
            pipe(
              getOrCreateChannel(streamId),

              Effect.flatMap((channel: PubSub.PubSub<TEvent>) =>
                pipe(
                  PubSub.subscribe(channel),

                  Effect.map((queue: Queue.Dequeue<TEvent>) =>
                    Stream.fromQueue(queue, { shutdown: true })
                  )
                )
              )
            ),
            (err: unknown) =>
              Effect.fail(
                new StreamingError({
                  message: `Failed to subscribe to events for stream ${streamId}`,
                  cause: err,
                })
              )
          ),

        publishToStream: (streamId, event) =>
          Effect.catchAll(
            pipe(
              getOrCreateChannel(streamId),

              Effect.flatMap((channel: PubSub.PubSub<TEvent>) =>
                pipe(
                  // Increment the events counter
                  Ref.update(eventsCounter, (count: number) => count + 1),
                  Effect.flatMap(() =>
                    pipe(
                      PubSub.publish(event)(channel),
                      Effect.map(() => undefined)
                    )
                  )
                )
              )
            ),
            (err: unknown) =>
              Effect.fail(
                new StreamingError({
                  message: 'Failed to publish event',
                  cause: err,
                })
              )
          ),

        getStreamMetrics: () =>
          pipe(
            Effect.all([Ref.get(channelsRef), Ref.get(eventsCounter)]),
            Effect.map(
              ([channels, count]: ReadonlyDeep<
                readonly [ReadonlyMap<string, PubSub.PubSub<TEvent>>, number]
              >) => ({
                activeStreams: channels.size,
                totalEventsProcessed: count,
              })
            )
          ),
      };

      return handler;
    })
  );

/**
 * Live Layer implementation of the StreamHandler
 */
export const StreamHandlerLive = <TEvent = unknown, TStreamId extends string = string>() => {
  const Tag = StreamHandler<TEvent, TStreamId>();
  return Layer.effect(Tag, makeStreamHandler<TEvent, TStreamId>());
};
