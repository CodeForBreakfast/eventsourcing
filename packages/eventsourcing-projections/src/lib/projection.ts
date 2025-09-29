import { Context, Data, Effect, Option, ParseResult, Schema, Sink, Stream, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { beginning, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { EventNumber, type ProjectionEventStore, EventStoreError } from './eventstore-shim';

export class MissingProjectionError extends Data.TaggedError('MissingProjectionError')<{
  readonly message: string;
}> {}

export interface Projection<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}

export const loadProjection =
  <TEvent, TData>(
    eventstoreTag: ReadonlyDeep<
      Context.Tag<ProjectionEventStore<TEvent>, ProjectionEventStore<TEvent>>
    >,
    apply: (
      data: ReadonlyDeep<Option.Option<TData>>
    ) => (
      event: ReadonlyDeep<TEvent>
    ) => Effect.Effect<TData, ParseResult.ParseError | MissingProjectionError>
  ) =>
  (
    id: string
  ): Effect.Effect<
    Projection<TData>,
    ParseResult.ParseError | MissingProjectionError | EventStoreError,
    ProjectionEventStore<TEvent>
  > =>
    pipe(
      eventstoreTag,
      Effect.flatMap((eventstore) =>
        pipe(
          id,
          toStreamId,
          Effect.flatMap(beginning),
          Effect.tap((position) =>
            Effect.annotateCurrentSpan({
              position,
            })
          ),
          Effect.flatMap(eventstore.read),
          Effect.map((stream) =>
            // Apply timeout to the stream
            Stream.take(Number.MAX_SAFE_INTEGER)(stream)
          ),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.run(
                Sink.foldLeftEffect(
                  { nextEventNumber: 0, data: Option.none<TData>() },
                  ({ nextEventNumber, data: before }, event) =>
                    pipe(
                      event as ReadonlyDeep<TEvent>,
                      apply(before as ReadonlyDeep<Option.Option<TData>>),
                      Effect.map(Option.some),
                      Effect.tap((after) =>
                        Effect.annotateCurrentSpan({
                          eventNumber: nextEventNumber,
                          event,
                          before,
                          after,
                        })
                      ),
                      Effect.map((after) => ({
                        nextEventNumber: nextEventNumber + 1,
                        data: after,
                      })),
                      Effect.withSpan('apply event')
                    )
                )
              ),
              Effect.withSpan('apply events')
            )
          ),
          Effect.flatMap(({ nextEventNumber, data }) =>
            pipe(
              nextEventNumber,
              Schema.decode(EventNumber),
              Effect.map(
                (nextEventNumber: EventNumber) =>
                  ({
                    nextEventNumber,
                    data,
                  }) as const
              )
            )
          )
        )
      ),
      Effect.withSpan('loadProjection')
    );
