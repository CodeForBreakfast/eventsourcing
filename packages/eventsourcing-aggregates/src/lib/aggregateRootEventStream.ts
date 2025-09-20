import {
  EventNumber,
  type EventStoreServiceInterface,
  EventStreamPosition,
  toStreamId,
  beginning,
} from '@codeforbreakfast/eventsourcing-store';
import {
  type Projection,
  createCompatibleEventStore,
} from '@codeforbreakfast/eventsourcing-projections';
import {
  Chunk,
  Clock,
  Context,
  Effect,
  Option,
  ParseResult,
  Schema,
  Sink,
  Stream,
  pipe,
} from 'effect';

// Mock PersonId for now - replace with actual implementation
const PersonId = Schema.String.pipe(Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;
import { CommandContext } from './commandInitiator';

const commit =
  <TEvent, TTag>(
    eventstoreTag: Readonly<
      Context.Tag<TTag, EventStoreServiceInterface<TEvent>>
    >,
  ) =>
  (id: string, eventNumber: EventNumber) =>
  (events: Chunk.Chunk<TEvent>) =>
    pipe(
      eventstoreTag,
      Effect.flatMap((eventstore) =>
        pipe(
          id,
          toStreamId,
          Effect.flatMap((streamId) =>
            pipe({ streamId, eventNumber }, Schema.decode(EventStreamPosition)),
          ),
          Effect.flatMap((position) =>
            pipe(
              events,
              Stream.fromChunk,
              Stream.run(eventstore.write(position)),
            ),
          ),
        ),
      ),
    );

export const aggregateRoot = <
  TId extends string,
  TEvent,
  TState,
  TCommands,
  TTag,
>(
  _idSchema: Schema.Schema<TId, string>,
  apply: (
    state: Readonly<Option.Option<TState>>,
  ) => (
    event: Readonly<TEvent>,
  ) => Effect.Effect<TState, ParseResult.ParseError>,
  tag: Readonly<Context.Tag<TTag, EventStoreServiceInterface<TEvent>>>,
  commands: TCommands,
) => ({
  new: (): Projection<TState> => ({
    nextEventNumber: 0,
    data: Option.none(),
  }),
  load: (id: string) =>
    pipe(
      tag,
      Effect.map(createCompatibleEventStore),
      Effect.flatMap((eventStore) =>
        pipe(
          // Create a read-only projection loader using the eventStore
          id,
          toStreamId,
          Effect.flatMap(beginning),
          Effect.flatMap((position: EventStreamPosition) =>
            eventStore.readHistorical(position),
          ),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.run(
                Sink.foldLeftEffect(
                  { nextEventNumber: 0, data: Option.none<TState>() },
                  ({ nextEventNumber, data: before }, event) =>
                    pipe(
                      event,
                      apply(before),
                      Effect.map(Option.some),
                      Effect.map((after) => ({
                        nextEventNumber: nextEventNumber + 1,
                        data: after,
                      })),
                    ),
                ),
              ),
            ),
          ),
          Effect.flatMap(
            ({
              nextEventNumber,
              data,
            }: Readonly<{
              nextEventNumber: number;
              data: Option.Option<TState>;
            }>) =>
              pipe(
                nextEventNumber,
                Schema.decode(EventNumber),
                Effect.map(
                  (decodedEventNumber: EventNumber) =>
                    ({ nextEventNumber: decodedEventNumber, data }) as const,
                ),
              ),
          ),
        ),
      ),
    ),
  commit: commit<TEvent, TTag>(tag),
  commands,
});

export const EventOriginatorId = Schema.Union(PersonId);

export const EventMetadata = Schema.Struct({
  occurredAt: Schema.ValidDateFromSelf,
});
export type EventMetadata = typeof EventMetadata.Type;
export const eventMetadata = () =>
  pipe(
    Effect.all({
      currentTime: Clock.currentTimeMillis,
      commandContext: CommandContext,
    }),
    Effect.flatMap(({ currentTime, commandContext }) =>
      pipe(
        commandContext.getInitiatorId,
        Effect.map((initiatorId) => ({
          occurredAt: new Date(currentTime),
          originator: initiatorId,
        })),
      ),
    ),
  );

export const eventSchema = <TType, F extends Schema.Struct.Fields, R>(
  type: Schema.Schema<TType, R>,
  data: F,
) =>
  Schema.Struct({
    type,
    metadata: EventMetadata,
    data: Schema.Struct(data),
  });
