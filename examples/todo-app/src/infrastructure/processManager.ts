import { Effect, Stream, pipe, Chunk, Option, Brand } from 'effect';
import { EventBus } from './eventBus';
import { TodoCreated, TodoDeleted } from '../domain/todoEvents';
import { TodoListAggregateRoot, TodoListState } from '../domain/todoListAggregate';
import { TODO_LIST_ID, UserId, TodoId } from '../domain/types';

type TodoListId = string & Brand.Brand<'TodoListId'>;

const TODO_LIST_ID_BRANDED = TODO_LIST_ID as TodoListId;

const isTodoCreated = (event: unknown): event is TodoCreated =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoCreated';

const isTodoDeleted = (event: unknown): event is TodoDeleted =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoDeleted';

const handleTodoCreated = (streamId: string, event: TodoCreated) =>
  Effect.gen(function* () {
    const state = yield* TodoListAggregateRoot.load(TODO_LIST_ID_BRANDED);
    const events = yield* TodoListAggregateRoot.commands.addTodo(
      event.metadata.originator as UserId,
      streamId as TodoId,
      event.data.title
    )(state.data as Readonly<Option.Option<TodoListState>>);

    if (events.length > 0) {
      yield* TodoListAggregateRoot.commit({
        id: TODO_LIST_ID_BRANDED,
        eventNumber: state.nextEventNumber,
        events: Chunk.fromIterable(events),
      });
    }
  });

const handleTodoDeleted = (streamId: string, event: TodoDeleted) =>
  Effect.gen(function* () {
    const state = yield* TodoListAggregateRoot.load(TODO_LIST_ID_BRANDED);
    const events = yield* TodoListAggregateRoot.commands.removeTodo(
      event.metadata.originator as UserId,
      streamId as TodoId
    )(state.data as Readonly<Option.Option<TodoListState>>);

    if (events.length > 0) {
      yield* TodoListAggregateRoot.commit({
        id: TODO_LIST_ID_BRANDED,
        eventNumber: state.nextEventNumber,
        events: Chunk.fromIterable(events),
      });
    }
  });

export const startProcessManager = () =>
  Effect.gen(function* () {
    const eventBus = yield* EventBus;

    const createdStream = yield* eventBus.subscribe(isTodoCreated);
    const deletedStream = yield* eventBus.subscribe(isTodoDeleted);

    yield* Effect.all(
      [
        pipe(
          createdStream,
          Stream.mapEffect(({ streamId, event }) =>
            pipe(
              handleTodoCreated(streamId, event),
              Effect.catchAll((error) =>
                Effect.logError(`Failed to handle TodoCreated: ${String(error)}`)
              )
            )
          ),
          Stream.runDrain
        ),
        pipe(
          deletedStream,
          Stream.mapEffect(({ streamId, event }) =>
            pipe(
              handleTodoDeleted(streamId, event),
              Effect.catchAll((error) =>
                Effect.logError(`Failed to handle TodoDeleted: ${String(error)}`)
              )
            )
          ),
          Stream.runDrain
        ),
      ],
      { concurrency: 'unbounded' }
    );
  });
