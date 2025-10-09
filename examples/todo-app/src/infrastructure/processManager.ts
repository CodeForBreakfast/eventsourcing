import { Effect, Stream, pipe, Chunk, Option } from 'effect';
import {
  AggregateState,
  provideCommandInitiator,
  EventRecord,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { EventBus, EventBusService } from './eventBus';
import { TodoCreated, TodoDeleted } from '../domain/todoEvents';
import { TodoListAggregateRoot, TodoListState } from '../domain/todoListAggregate';
import { TodoListEvent } from '../domain/todoListEvents';
import { TODO_LIST_ID, UserId, TodoId } from '../domain/types';

const isTodoCreated = (event: unknown): event is EventRecord<TodoCreated, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoCreated';

const isTodoDeleted = (event: unknown): event is EventRecord<TodoDeleted, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoDeleted';

const withCommandInitiator = <TEvent extends EventRecord<unknown, UserId>, TResult, TError>(
  event: TEvent,
  effect: Effect.Effect<TResult, TError>
) => pipe(effect, Effect.provide(provideCommandInitiator(event.metadata.origin as UserId)));

const commitEvents = (eventNumber: number) => (events: Readonly<ReadonlyArray<TodoListEvent>>) =>
  events.length > 0
    ? TodoListAggregateRoot.commit({
        id: TODO_LIST_ID,
        eventNumber,
        events: Chunk.fromIterable(events),
      })
    : Effect.void;

const executeAndCommit = <TEvent extends EventRecord<unknown, UserId>, TError>(
  state: Readonly<AggregateState<TodoListState>>,
  event: TEvent,
  command: Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) =>
  pipe(
    command,
    (effect) => withCommandInitiator(event, effect),
    Effect.flatMap(commitEvents(state.nextEventNumber))
  );

const castToAggregateState = (state: {
  readonly nextEventNumber: number;
  readonly data: Readonly<Option.Option<unknown>>;
}): Readonly<AggregateState<TodoListState>> => state as Readonly<AggregateState<TodoListState>>;

const handleCommand = <TEvent extends EventRecord<unknown, UserId>, TError>(
  event: TEvent,
  buildCommand: (
    state: Readonly<AggregateState<TodoListState>>
  ) => Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) =>
  pipe(
    TODO_LIST_ID,
    TodoListAggregateRoot.load,
    Effect.map(castToAggregateState),
    Effect.flatMap((state) => executeAndCommit(state, event, buildCommand(state)))
  );

const handleTodoCreated = (streamId: string, event: Readonly<EventRecord<TodoCreated, UserId>>) =>
  handleCommand(event, (state) =>
    pipe(state.data, TodoListAggregateRoot.commands.addTodo(streamId as TodoId, event.data.title))
  );

const handleTodoDeleted = (streamId: string, event: Readonly<EventRecord<TodoDeleted, UserId>>) =>
  handleCommand(event, (state) =>
    pipe(state.data, TodoListAggregateRoot.commands.removeTodo(streamId as TodoId))
  );

const handleCreatedWithLogging = ({
  streamId,
  event,
}: {
  readonly streamId: string;
  readonly event: EventRecord<TodoCreated, UserId>;
}) =>
  pipe(
    handleTodoCreated(streamId, event),
    Effect.catchAll((error) => Effect.logError(`Failed to handle TodoCreated: ${String(error)}`))
  );

const handleDeletedWithLogging = ({
  streamId,
  event,
}: {
  readonly streamId: string;
  readonly event: EventRecord<TodoDeleted, UserId>;
}) =>
  pipe(
    handleTodoDeleted(streamId, event),
    Effect.catchAll((error) => Effect.logError(`Failed to handle TodoDeleted: ${String(error)}`))
  );

const runCreatedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoCreated, UserId> },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleCreatedWithLogging), Stream.runDrain);

const runDeletedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoDeleted, UserId> },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleDeletedWithLogging), Stream.runDrain);

const subscribeToStreams = (eventBus: EventBusService) =>
  Effect.all([eventBus.subscribe(isTodoCreated), eventBus.subscribe(isTodoDeleted)]);

const runBothStreams = ([createdStream, deletedStream]: readonly [
  Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoCreated, UserId> },
    unknown,
    unknown
  >,
  Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoDeleted, UserId> },
    unknown,
    unknown
  >,
]) =>
  Effect.all([runCreatedStream(createdStream), runDeletedStream(deletedStream)], {
    concurrency: 'unbounded',
  });

const processEventBus = (eventBus: EventBusService) =>
  pipe(eventBus, subscribeToStreams, Effect.flatMap(runBothStreams));

export const startProcessManager = () => pipe(EventBus, Effect.flatMap(processEventBus));
