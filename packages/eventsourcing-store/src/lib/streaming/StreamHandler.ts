import { Data, Effect, Stream, Scope } from 'effect';

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
