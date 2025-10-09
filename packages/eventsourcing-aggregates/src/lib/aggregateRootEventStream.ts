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

import { CommandContext, type CommandContextService } from './commandInitiator';

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
export interface CommitOptions<TId extends string, TEvent> {
  readonly id: TId;
  readonly eventNumber: EventNumber;
  readonly events: Chunk.Chunk<TEvent>;
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
const decodeStreamPositionFromEventNumber =
  (eventNumber: EventNumber) => (streamId: EventStreamPosition['streamId']) =>
    pipe({ streamId, eventNumber }, Schema.decode(EventStreamPosition));

const appendEventsAtPosition = <TEvent>(
  events: Chunk.Chunk<TEvent>,
  position: EventStreamPosition,
  eventstore: EventStore<TEvent>
) => pipe(events, Stream.fromChunk, Stream.run(eventstore.append(position)));

const commitToEventStore =
  <TId extends string, TEvent>(id: TId, eventNumber: EventNumber, events: Chunk.Chunk<TEvent>) =>
  (eventstore: EventStore<TEvent>) =>
    pipe(
      id,
      toStreamId,
      Effect.flatMap(decodeStreamPositionFromEventNumber(eventNumber)),
      Effect.flatMap((position) => appendEventsAtPosition(events, position, eventstore))
    );

const enrichEventWithMetadata = <TEvent, TOrigin>(
  event: TEvent,
  metadata: EventMetadata<TOrigin>
): EventRecord<TEvent, TOrigin> => ({
  ...event,
  metadata,
});

const enrichEventsWithMetadata = <TEvent, TOrigin>(events: Chunk.Chunk<TEvent>) =>
  pipe(
    eventMetadata<TOrigin>(),
    Effect.map((metadata) => Chunk.map(events, (event) => enrichEventWithMetadata(event, metadata)))
  );

const getEventStoreAndCommit = <TId extends string, TEvent, TOrigin, TTag>(
  eventstoreTag: Readonly<Context.Tag<TTag, EventStore<EventRecord<TEvent, TOrigin>>>>,
  id: TId,
  eventNumber: EventNumber,
  enrichedEvents: Chunk.Chunk<EventRecord<TEvent, TOrigin>>
) => pipe(eventstoreTag, Effect.flatMap(commitToEventStore(id, eventNumber, enrichedEvents)));

const commit =
  <TId extends string, TEvent, TOrigin, TTag>(
    eventstoreTag: Readonly<Context.Tag<TTag, EventStore<EventRecord<TEvent, TOrigin>>>>
  ) =>
  (options: CommitOptions<TId, TEvent>) =>
    pipe(
      options.events,
      enrichEventsWithMetadata<TEvent, TOrigin>,
      Effect.flatMap((enrichedEvents) =>
        getEventStoreAndCommit(eventstoreTag, options.id, options.eventNumber, enrichedEvents)
      )
    );

const setStateToNewValue = <TState>(
  newState: TState,
  stateRef: Ref.Ref<{ readonly nextEventNumber: number; readonly data: Option.Option<TState> }>
) =>
  pipe(
    stateRef,
    Ref.update(() => ({
      nextEventNumber: 0,
      data: Option.some(newState),
    }))
  );

const applyEventAndUpdateRef = <TState, TEvent>(
  apply: (
    state: Readonly<Option.Option<TState>>
  ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
  before: Readonly<Option.Option<TState>>,
  event: Readonly<TEvent>,
  stateRef: Ref.Ref<{ readonly nextEventNumber: number; readonly data: Option.Option<TState> }>
) =>
  pipe(
    event,
    apply(before),
    Effect.flatMap((newState) => setStateToNewValue(newState, stateRef))
  );

const processEventWithRef = <TState, TEvent>(
  apply: (
    state: Readonly<Option.Option<TState>>
  ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
  event: Readonly<TEvent>,
  stateRef: Ref.Ref<{ readonly nextEventNumber: number; readonly data: Option.Option<TState> }>
) =>
  pipe(
    stateRef,
    Ref.get,
    Effect.flatMap(({ data: before }) => applyEventAndUpdateRef(apply, before, event, stateRef))
  );

const foldEventsIntoState =
  <TState, TEvent>(
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
    stream: Stream.Stream<TEvent, unknown>
  ) =>
  (stateRef: Ref.Ref<{ readonly nextEventNumber: number; readonly data: Option.Option<TState> }>) =>
    pipe(
      stream,
      Stream.runForEach((event) => processEventWithRef(apply, event, stateRef)),
      Effect.andThen(Ref.get(stateRef))
    );

const processEventStream =
  <TState, TEvent>(
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>
  ) =>
  (stream: Stream.Stream<TEvent, unknown>) =>
    pipe(
      { nextEventNumber: 0, data: Option.none<TState>() },
      Ref.make,
      Effect.flatMap(foldEventsIntoState(apply, stream))
    );

const createDecodedResult = <TState>(
  decodedEventNumber: EventNumber,
  data: Readonly<Option.Option<TState>>
) => ({ nextEventNumber: decodedEventNumber, data }) as const;

const decodeEventNumber = <TState>(
  nextEventNumber: Readonly<number>,
  data: Readonly<Option.Option<TState>>
) =>
  pipe(
    nextEventNumber,
    Schema.decode(EventNumber),
    Effect.map((decodedEventNumber) => createDecodedResult(decodedEventNumber, data))
  );

const loadStreamEvents = <TId extends string, TEvent>(eventStore: EventStore<TEvent>, id: TId) =>
  pipe(id, toStreamId, Effect.flatMap(beginning), Effect.flatMap(eventStore.read));

const stripMetadata = <TEvent, TOrigin>(record: EventRecord<TEvent, TOrigin>): TEvent => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _ is intentionally unused in destructuring to extract metadata
  const { metadata: _, ...event } = record;
  return event as TEvent;
};

const loadAggregateState =
  <TId extends string, TState, TEvent, TOrigin>(
    id: TId,
    apply: (
      state: Readonly<Option.Option<TState>>
    ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>
  ) =>
  (eventStore: EventStore<EventRecord<TEvent, TOrigin>>) =>
    pipe(
      loadStreamEvents(eventStore, id),
      Effect.map(Stream.map(stripMetadata)),
      Effect.flatMap(processEventStream(apply)),
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
 *   PersonId,
 *   applyUserEvent,
 *   UserEventStoreTag,
 *   userCommands
 * );
 *
 * // Load an existing aggregate - type-safe with branded ID
 * const user = await Effect.runPromise(UserAggregate.load('user-123' as UserId));
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
 * @param _idSchema - Schema for the aggregate ID type (used for type inference only)
 * @param _initiatorSchema - Schema for the command initiator type (used for type inference only)
 * @param apply - Function to apply events to state
 * @param tag - The event store service tag
 * @param commands - Command handlers for the aggregate
 * @returns An aggregate root with methods for loading, creating, and committing
 * @throws {ParseResult.ParseError} If events cannot be parsed
 * @throws {EventStoreError} If the event store operations fail
 */
export const makeAggregateRoot = <TId extends string, TInitiator, TEvent, TState, TCommands, TTag>(
  _idSchema: Schema.Schema<TId, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema.Schema requires any for input type
  _initiatorSchema: Schema.Schema<TInitiator, any>,
  apply: (
    state: Readonly<Option.Option<TState>>
  ) => (event: Readonly<TEvent>) => Effect.Effect<TState, ParseResult.ParseError>,
  tag: Readonly<Context.Tag<TTag, EventStore<EventRecord<TEvent, TInitiator>>>>,
  commands: TCommands
) => ({
  new: (): AggregateState<TState> => ({
    nextEventNumber: 0,
    data: Option.none(),
  }),
  load: (id: TId) => pipe(tag, Effect.flatMap(loadAggregateState(id, apply))),
  commit: commit<TId, TEvent, TInitiator, TTag>(tag),
  commands,
});

export interface EventMetadata<TOrigin> {
  readonly occurredAt: Date;
  readonly origin: TOrigin;
}

export type EventRecord<TEvent, TOrigin> = TEvent & {
  readonly metadata: EventMetadata<TOrigin>;
};

export const EventMetadata = <TOrigin>(originSchema: Schema.Schema<TOrigin>) =>
  Schema.Struct({
    occurredAt: Schema.ValidDateFromSelf,
    origin: originSchema,
  });

const createMetadataFromInitiator =
  <TInitiator>(currentTime: number) =>
  (initiator: TInitiator) => ({
    occurredAt: new Date(currentTime),
    origin: initiator,
  });

const getInitiator =
  <TInitiator>(currentTime: number) =>
  (commandContext: CommandContextService<TInitiator>) =>
    pipe(
      commandContext.getInitiator,
      Effect.map(createMetadataFromInitiator<TInitiator>(currentTime))
    );

const getMetadataFromContext = <TInitiator>(currentTime: number) =>
  pipe(CommandContext<TInitiator>(), Effect.flatMap(getInitiator<TInitiator>(currentTime)));

/**
 * Creates event metadata with timestamp and origin information
 *
 * @since 0.4.0
 * @example
 * ```typescript
 * const metadata = await Effect.runPromise(eventMetadata());
 * console.log(metadata.occurredAt); // Current timestamp
 * console.log(metadata.origin); // Origin from context
 * ```
 *
 * @returns Effect that resolves to event metadata
 * @throws {NoSuchElementException} If CommandContext is not available
 */
export const eventMetadata = <TInitiator>() =>
  pipe(Clock.currentTimeMillis, Effect.flatMap(getMetadataFromContext<TInitiator>));

/**
 * Creates a schema for bare domain events with type and data fields
 *
 * Events created with this helper are bare business events without metadata.
 * The framework automatically enriches them with metadata during commit.
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
 *
 * const SystemEvent = eventSchema(
 *   Schema.Literal('SystemSync'),
 *   { timestamp: Schema.Number }
 * );
 * ```
 *
 * @param type - Schema for the event type discriminator
 * @param data - Schema fields for the event data
 * @returns A Schema.Struct with type and data fields (bare event, no metadata)
 */
export const eventSchema = <TType, F extends Schema.Struct.Fields, R>(
  type: Schema.Schema<TType, R>,
  data: F
) =>
  Schema.Struct({
    type,
    data: Schema.Struct(data),
  });
