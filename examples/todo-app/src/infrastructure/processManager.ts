import { Effect, Stream, pipe, Chunk, Brand, Option } from 'effect';
import {
  AggregateState,
  provideCommandInitiator,
  EventRecord,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { EventBus, EventBusService } from './eventBus';
import { TodoCreated, TodoDeleted } from '../domain/todoEvents';
import { TodoListAggregateRoot, TodoListState } from '../domain/todoListAggregate';
import { TODO_LIST_ID, UserId, TodoId } from '../domain/types';

type TodoListId = string & Brand.Brand<'TodoListId'>;

const TODO_LIST_ID_BRANDED = TODO_LIST_ID as TodoListId;

const isTodoCreated = (event: unknown): event is EventRecord<TodoCreated, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoCreated';

const isTodoDeleted = (event: unknown): event is EventRecord<TodoDeleted, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoDeleted';

const executeAddTodoCommand = (
  state: Readonly<Option.Option<TodoListState>>,
  streamId: string,
  event: Readonly<EventRecord<TodoCreated, UserId>>
) =>
  pipe(
    state,
    TodoListAggregateRoot.commands.addTodo(streamId as TodoId, event.data.title),
    Effect.provide(provideCommandInitiator(event.metadata.origin as UserId))
  );

const commitAddTodoEvents = (eventNumber: number) => (events: Readonly<ReadonlyArray<unknown>>) =>
  events.length > 0
    ? TodoListAggregateRoot.commit({
        id: TODO_LIST_ID_BRANDED,
        eventNumber,
        events: Chunk.fromIterable(events),
      })
    : Effect.void;

const addTodoAndCommit = (
  state: Readonly<AggregateState<TodoListState>>,
  streamId: string,
  event: Readonly<EventRecord<TodoCreated, UserId>>
) =>
  pipe(
    state.data,
    (data) => executeAddTodoCommand(data, streamId, event),
    Effect.flatMap(commitAddTodoEvents(state.nextEventNumber))
  );

const castToAggregateState = (state: {
  readonly nextEventNumber: number;
  readonly data: Readonly<Option.Option<unknown>>;
}): Readonly<AggregateState<TodoListState>> => state as Readonly<AggregateState<TodoListState>>;

const handleTodoCreated = (streamId: string, event: Readonly<EventRecord<TodoCreated, UserId>>) =>
  pipe(
    TODO_LIST_ID_BRANDED,
    TodoListAggregateRoot.load,
    Effect.map(castToAggregateState),
    Effect.flatMap((state) => addTodoAndCommit(state, streamId, event))
  );

const executeRemoveTodoCommand = (
  state: Readonly<Option.Option<TodoListState>>,
  streamId: string,
  event: Readonly<EventRecord<TodoDeleted, UserId>>
) =>
  pipe(
    state,
    TodoListAggregateRoot.commands.removeTodo(streamId as TodoId),
    Effect.provide(provideCommandInitiator(event.metadata.origin as UserId))
  );

const commitRemoveTodoEvents =
  (eventNumber: number) => (events: Readonly<ReadonlyArray<unknown>>) =>
    events.length > 0
      ? TodoListAggregateRoot.commit({
          id: TODO_LIST_ID_BRANDED,
          eventNumber,
          events: Chunk.fromIterable(events),
        })
      : Effect.void;

const removeTodoAndCommit = (
  state: Readonly<AggregateState<TodoListState>>,
  streamId: string,
  event: Readonly<EventRecord<TodoDeleted, UserId>>
) =>
  pipe(
    state.data,
    (data) => executeRemoveTodoCommand(data, streamId, event),
    Effect.flatMap(commitRemoveTodoEvents(state.nextEventNumber))
  );

const handleTodoDeleted = (streamId: string, event: Readonly<EventRecord<TodoDeleted, UserId>>) =>
  pipe(
    TODO_LIST_ID_BRANDED,
    TodoListAggregateRoot.load,
    Effect.map(castToAggregateState),
    Effect.flatMap((state) => removeTodoAndCommit(state, streamId, event))
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
