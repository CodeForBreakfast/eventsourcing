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

const applyEventAndAnnotate = <TEvent, TData>(
  apply: (
    data: ReadonlyDeep<Option.Option<TData>>
  ) => (
    event: ReadonlyDeep<TEvent>
  ) => Effect.Effect<TData, ParseResult.ParseError | MissingProjectionError>,
  nextEventNumber: number,
  before: Readonly<Option.Option<TData>>,
  event: Readonly<TEvent>
) =>
  pipe(
    event as ReadonlyDeep<TEvent>,
    apply(before as ReadonlyDeep<Option.Option<TData>>),
    Effect.asSome,
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
  );

const foldEvents =
  <TEvent, TData>(
    apply: (
      data: ReadonlyDeep<Option.Option<TData>>
    ) => (
      event: ReadonlyDeep<TEvent>
    ) => Effect.Effect<TData, ParseResult.ParseError | MissingProjectionError>
  ) =>
  (stream: Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>) =>
    pipe(
      stream,
      Stream.run(
        Sink.foldLeftEffect(
          { nextEventNumber: 0, data: Option.none<TData>() },
          ({ nextEventNumber, data: before }, event) =>
            applyEventAndAnnotate(apply, nextEventNumber, before, event)
        )
      ),
      Effect.withSpan('apply events')
    );

const decodeProjectionEventNumber = <TData>(
  nextEventNumber: number,
  data: Readonly<Option.Option<TData>>
): Effect.Effect<Projection<TData>, ParseResult.ParseError> =>
  pipe(
    nextEventNumber,
    Schema.decode(EventNumber),
    Effect.map(
      (nextEventNumber: EventNumber): Projection<TData> => ({
        nextEventNumber,
        data,
      })
    )
  );

const limitStreamToMaxSafeInteger = <TEvent>(
  stream: Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>
): Effect.Effect<Stream.Stream<TEvent, ParseResult.ParseError | EventStoreError>> =>
  pipe(stream, Stream.take(Number.MAX_SAFE_INTEGER), Effect.succeed);

const loadAndProcessEvents =
  <TEvent, TData>(
    id: string,
    apply: (
      data: ReadonlyDeep<Option.Option<TData>>
    ) => (
      event: ReadonlyDeep<TEvent>
    ) => Effect.Effect<TData, ParseResult.ParseError | MissingProjectionError>
  ) =>
  (eventstore: ProjectionEventStore<TEvent>) =>
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
      Effect.flatMap(limitStreamToMaxSafeInteger),
      Effect.flatMap(foldEvents(apply)),
      Effect.flatMap(({ nextEventNumber, data }) =>
        decodeProjectionEventNumber(nextEventNumber, data)
      )
    );

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
      Effect.flatMap(loadAndProcessEvents(id, apply)),
      Effect.withSpan('loadProjection')
    );
