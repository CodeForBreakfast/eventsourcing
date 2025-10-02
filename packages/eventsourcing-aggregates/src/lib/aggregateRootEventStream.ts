import {
  EventNumber,
  type EventStore,
  EventStreamPosition,
  toStreamId,
  beginning,
} from '@codeforbreakfast/eventsourcing-store';
import {
  Chunk,
  Clock,
  Context,
  Effect,
  Option,
  ParseResult,
  Ref,
  Schema,
  Stream,
  pipe,
} from 'effect';

// Mock PersonId for now - replace with actual implementation
const PersonId = Schema.String.pipe(Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;
import { CommandContext } from './commandInitiator';

/**
 * Represents the state of an aggregate at a particular point in time
 * This replaces the Projection type to keep aggregates focused on write-side concerns
 * @since 0.4.0
 */
export interface AggregateState<TData> {
  readonly nextEventNumber: EventNumber;
  readonly data: Option.Option<TData>;
}

/**
 * Options for committing events to an aggregate
 * @since 0.4.0
 */
export interface CommitOptions {
  readonly id: string;
  readonly eventNumber: EventNumber;
  readonly events: Chunk.Chunk<unknown>;
}

/**
 * Commits events to an aggregate stream using curried pattern for elegant composition.
 *
 * The function is curried with the service tag first for dependency injection,
 * allowing beautiful pipe composition patterns.
 *
 * @since 0.4.0
 * @example
 * ```typescript
 * // Basic usage
 * const commitEvents = commit(MyEventStoreTag);
 * await Effect.runPromise(
 *   commitEvents({
 *     id: 'aggregate-123',
 *     eventNumber: 0,
 *     events: Chunk.of(event1, event2)
 *   })
 * );
 *
 * // Pipe composition pattern
 * await Effect.runPromise(
 *   pipe(
 *     Chunk.of(event1, event2),
 *     (events) => ({ id: 'aggregate-123', eventNumber: 0, events }),
 *     commit(MyEventStoreTag),
 *     Effect.tap(() => Console.log('Events committed'))
 *   )
 * );
 *
 * // Chaining multiple operations
 * await Effect.runPromise(
 *   pipe(
 *     loadAggregate(id),
 *     Effect.flatMap((aggregate) =>
 *       pipe(
 *         processCommand(command, aggregate),
 *         commit(MyEventStoreTag)
 *       )
 *     )
 *   )
 * );
 * ```
 *
 * @param eventstoreTag - The event store service tag (curried first for DI)
 * @returns A function that commits events with the provided options
 * @throws {ConcurrencyConflictError} If the event number doesn't match the stream position
 * @throws {EventStoreError} If writing to the store fails
 */
const createStreamPosition = (
  streamId: EventStreamPosition['streamId'],
  eventNumber: EventNumber
) => pipe({ streamId, eventNumber }, Schema.decode(EventStreamPosition));

const writeEventsToPosition =
  <TEvent>(events: Chunk.Chunk<TEvent>, position: EventStreamPosition) =>
  (eventstore: EventStore<TEvent>) =>
    pipe(events, Stream.fromChunk, Stream.run(eventstore.append(position)));

const commitToEventStore =
  <TEvent>(id: string, eventNumber: EventNumber, events: Chunk.Chunk<TEvent>) =>
  (eventstore: EventStore<TEvent>) =>
    pipe(
      id,
      toStreamId,
      Effect.flatMap((streamId) => createStreamPosition(streamId, eventNumber)),
      Effect.flatMap((position) => writeEventsToPosition(events, position)(eventstore))
    );

const commit =
  <TEvent, TTag>(eventstoreTag: Readonly<Context.Tag<TTag, EventStore<TEvent>>>) =>
  (options: CommitOptions) =>
    pipe(
      eventstoreTag,
      Effect.flatMap(
        commitToEventStore(options.id, options.eventNumber, options.events as Chunk.Chunk<TEvent>)
      )
    );

const updateStateWithEvent =
  <TState>(newState: TState) =>
  (stateRef: Ref.Ref<{ nextEventNumber: number; data: Option.Option<TState> }>) =>
    pipe(
      stateRef,
      Ref.update(() => ({
        nextEventNumber: 0,
        data: Option.some(newState),
      }))
    );

const applyAndUpdateState =
  <TState, TEvent>(
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
    before: Option.Option<TState>,
    event: TEvent
  ) =>
  (stateRef: Ref.Ref<{ nextEventNumber: number; data: Option.Option<TState> }>) =>
    pipe(
      event,
      apply(before),
      Effect.flatMap((newState) => updateStateWithEvent(newState)(stateRef))
    );

const applyEventToState =
  <TState, TEvent>(
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
    event: TEvent
  ) =>
  (stateRef: Ref.Ref<{ nextEventNumber: number; data: Option.Option<TState> }>) =>
    pipe(
      stateRef,
      Ref.get,
      Effect.flatMap(({ data: before }) => applyAndUpdateState(apply, before, event)(stateRef))
    );

const foldEventsIntoState =
  <TState, TEvent>(
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
    stream: Stream.Stream<TEvent, unknown>
  ) =>
  (stateRef: Ref.Ref<{ nextEventNumber: number; data: Option.Option<TState> }>) =>
    pipe(
      stream,
      Stream.runForEach((event) => applyEventToState(apply, event)(stateRef)),
      Effect.flatMap(() => Ref.get(stateRef))
    );

const processEventStream = <TState, TEvent>(
  apply: (
    state: Readonly<Option.Option<TState>>
  ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
  stream: Stream.Stream<TEvent, unknown>
) =>
  pipe(
    Ref.make({ nextEventNumber: 0, data: Option.none<TState>() }),
    Effect.flatMap(foldEventsIntoState(apply, stream))
  );

const decodeEventNumber = (nextEventNumber: number, data: Option.Option<unknown>) =>
  pipe(
    nextEventNumber,
    Schema.decode(EventNumber),
    Effect.map(
      (decodedEventNumber: EventNumber) => ({ nextEventNumber: decodedEventNumber, data }) as const
    )
  );

const loadStreamEvents = <TEvent>(eventStore: EventStore<TEvent>, id: string) =>
  pipe(
    id,
    toStreamId,
    Effect.flatMap(beginning),
    Effect.flatMap((position: Readonly<EventStreamPosition>) => eventStore.read(position))
  );

const loadAggregateState =
  <TState, TEvent>(
    id: string,
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>
  ) =>
  (eventStore: EventStore<TEvent>) =>
    pipe(
      loadStreamEvents(eventStore, id),
      Effect.flatMap((stream) => processEventStream(apply, stream)),
      Effect.flatMap(({ nextEventNumber, data }) => decodeEventNumber(nextEventNumber, data))
    );

/**
 * Creates an aggregate root with event sourcing capabilities
 *
 * @since 0.4.0
 * @example
 * ```typescript
 * import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
 *
 * const UserAggregate = makeAggregateRoot(
 *   UserId,
 *   applyUserEvent,
 *   UserEventStoreTag,
 *   userCommands
 * );
 *
 * // Load an existing aggregate
 * const user = await Effect.runPromise(UserAggregate.load('user-123'));
 *
 * // Create a new aggregate
 * const newUser = UserAggregate.new();
 *
 * // Commit events
 * await Effect.runPromise(
 *   UserAggregate.commit({
 *     id: 'user-123',
 *     eventNumber: 0,
 *     events: Chunk.of(userCreatedEvent)
 *   })
 * );
 * ```
 *
 * @param idSchema - Schema for the aggregate ID type
 * @param apply - Function to apply events to state
 * @param tag - The event store service tag
 * @param commands - Command handlers for the aggregate
 * @returns An aggregate root with methods for loading, creating, and committing
 * @throws {ParseResult.ParseError} If events cannot be parsed
 * @throws {EventStoreError} If the event store operations fail
 */
export const makeAggregateRoot = <TId extends string, TEvent, TState, TCommands, TTag>(
  _idSchema: Schema.Schema<TId, string>,
  apply: (
    state: Readonly<Option.Option<TState>>
  ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
  tag: Readonly<Context.Tag<TTag, EventStore<TEvent>>>,
  commands: TCommands
) => ({
  new: (): AggregateState<TState> => ({
    nextEventNumber: 0,
    data: Option.none(),
  }),
  load: (id: string) => pipe(tag, Effect.flatMap(loadAggregateState(id, apply))),
  commit: commit<TEvent, TTag>(tag),
  commands,
});

export const EventOriginatorId = Schema.Union(PersonId);

export const EventMetadata = Schema.Struct({
  occurredAt: Schema.ValidDateFromSelf,
});
export type EventMetadata = typeof EventMetadata.Type;

/**
 * Creates event metadata with timestamp and originator information
 *
 * @since 0.4.0
 * @example
 * ```typescript
 * const metadata = await Effect.runPromise(eventMetadata());
 * console.log(metadata.occurredAt); // Current timestamp
 * console.log(metadata.originator); // User ID from context
 * ```
 *
 * @returns Effect that resolves to event metadata
 * @throws {NoSuchElementException} If CommandContext is not available
 */
export const eventMetadata = () =>
  pipe(
    Clock.currentTimeMillis,
    Effect.flatMap((currentTime) =>
      pipe(
        CommandContext,
        Effect.flatMap((commandContext) =>
          pipe(
            commandContext.getInitiatorId,
            Effect.map((initiatorId) => ({
              occurredAt: new Date(currentTime),
              originator: initiatorId,
            }))
          )
        )
      )
    )
  );

/**
 * Creates a schema for domain events with type, metadata, and data fields
 *
 * @since 0.4.0
 * @example
 * ```typescript
 * const UserCreatedEvent = eventSchema(
 *   Schema.Literal('UserCreated'),
 *   {
 *     userId: Schema.String,
 *     email: Schema.String,
 *     name: Schema.String
 *   }
 * );
 * ```
 *
 * @param type - Schema for the event type discriminator
 * @param data - Schema fields for the event data
 * @returns A Schema.Struct with type, metadata, and data fields
 */
export const eventSchema = <TType, F extends Schema.Struct.Fields, R>(
  type: Schema.Schema<TType, R>,
  data: F
) =>
  Schema.Struct({
    type,
    metadata: EventMetadata,
    data: Schema.Struct(data),
  });
