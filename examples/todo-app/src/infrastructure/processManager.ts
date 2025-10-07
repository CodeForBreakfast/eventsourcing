import { Effect, Stream, pipe, Chunk, Option, Brand } from 'effect';
import { AggregateState } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventBus, EventBusService } from './eventBus';
import { TodoCreated, TodoDeleted } from '../domain/todoEvents';
import { TodoListAggregateRoot, TodoListState } from '../domain/todoListAggregate';
import { TODO_LIST_ID, UserId, TodoId } from '../domain/types';

type TodoListId = string & Brand.Brand<'TodoListId'>;

const TODO_LIST_ID_BRANDED = TODO_LIST_ID as TodoListId;

const isTodoCreated = (event: unknown): event is TodoCreated =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoCreated';

const isTodoDeleted = (event: unknown): event is TodoDeleted =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoDeleted';

const addTodoAndCommit = (
  state: Readonly<AggregateState<TodoListState>>,
  streamId: string,
  event: Readonly<TodoCreated>
) =>
  pipe(
    TodoListAggregateRoot.commands.addTodo(
      event.metadata.originator as UserId,
      streamId as TodoId,
      event.data.title
    )(state.data as Readonly<Option.Option<TodoListState>>),
    Effect.flatMap((events) =>
      events.length > 0
        ? TodoListAggregateRoot.commit({
            id: TODO_LIST_ID_BRANDED,
            eventNumber: state.nextEventNumber,
            events: Chunk.fromIterable(events),
          })
        : Effect.void
    )
  );

const handleTodoCreated = (streamId: string, event: Readonly<TodoCreated>) =>
  pipe(
    TodoListAggregateRoot.load(TODO_LIST_ID_BRANDED),
    Effect.flatMap((state) =>
      addTodoAndCommit(state as Readonly<AggregateState<TodoListState>>, streamId, event)
    )
  );

const removeTodoAndCommit = (
  state: Readonly<AggregateState<TodoListState>>,
  streamId: string,
  event: Readonly<TodoDeleted>
) =>
  pipe(
    TodoListAggregateRoot.commands.removeTodo(
      event.metadata.originator as UserId,
      streamId as TodoId
    )(state.data as Readonly<Option.Option<TodoListState>>),
    Effect.flatMap((events) =>
      events.length > 0
        ? TodoListAggregateRoot.commit({
            id: TODO_LIST_ID_BRANDED,
            eventNumber: state.nextEventNumber,
            events: Chunk.fromIterable(events),
          })
        : Effect.void
    )
  );

const handleTodoDeleted = (streamId: string, event: Readonly<TodoDeleted>) =>
  pipe(
    TodoListAggregateRoot.load(TODO_LIST_ID_BRANDED),
    Effect.flatMap((state) =>
      removeTodoAndCommit(state as Readonly<AggregateState<TodoListState>>, streamId, event)
    )
  );

const handleCreatedWithLogging = ({
  streamId,
  event,
}: {
  readonly streamId: string;
  readonly event: TodoCreated;
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
  readonly event: TodoDeleted;
}) =>
  pipe(
    handleTodoDeleted(streamId, event),
    Effect.catchAll((error) => Effect.logError(`Failed to handle TodoDeleted: ${String(error)}`))
  );

const runCreatedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: TodoCreated },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleCreatedWithLogging), Stream.runDrain);

const runDeletedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: TodoDeleted },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleDeletedWithLogging), Stream.runDrain);

const subscribeToStreams = (eventBus: EventBusService) =>
  Effect.all([eventBus.subscribe(isTodoCreated), eventBus.subscribe(isTodoDeleted)]);

const runBothStreams = ([createdStream, deletedStream]: readonly [
  Stream.Stream<{ readonly streamId: string; readonly event: TodoCreated }, unknown, unknown>,
  Stream.Stream<{ readonly streamId: string; readonly event: TodoDeleted }, unknown, unknown>,
]) =>
  Effect.all([runCreatedStream(createdStream), runDeletedStream(deletedStream)], {
    concurrency: 'unbounded',
  });

const processEventBus = (eventBus: EventBusService) =>
  pipe(eventBus, subscribeToStreams, Effect.flatMap(runBothStreams));

export const startProcessManager = () => pipe(EventBus, Effect.flatMap(processEventBus));
