import { Context, Effect, Option, pipe } from 'effect';
import {
  loadProjection,
  makeProjectionEventStore,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';
import { TodoId, TODO_LIST_ID } from '../domain/types';
import { TodoListEvent } from '../domain/todoListEvents';
import { TodoListAggregate } from '../domain/todoListAggregate';

export type TodoListItem = {
  readonly todoId: TodoId;
  readonly title: string;
  readonly addedAt: Readonly<Date>;
};

export interface TodoListProjection {
  readonly todos: readonly TodoListItem[];
}

const applyEvent =
  (state: Readonly<Option.Option<TodoListProjection>>) =>
  (event: Readonly<TodoListEvent>): Effect.Effect<TodoListProjection, never> => {
    const currentState = Option.getOrElse(state, () => ({ todos: [] }));

    if (event.type === 'TodoAddedToList') {
      const existingIndex = currentState.todos.findIndex((t) => t.todoId === event.data.todoId);
      if (existingIndex >= 0) {
        return Effect.succeed(currentState);
      }

      return Effect.succeed({
        todos: [
          ...currentState.todos,
          {
            todoId: event.data.todoId,
            title: event.data.title,
            addedAt: event.data.addedAt,
          },
        ],
      });
    }

    if (event.type === 'TodoRemovedFromList') {
      return Effect.succeed({
        todos: currentState.todos.filter((t) => t.todoId !== event.data.todoId),
      });
    }

    return Effect.succeed(currentState);
  };

const TodoListProjectionEventStore = Context.GenericTag<ProjectionEventStore<TodoListEvent>>(
  'TodoListProjectionEventStore'
);

const applyProjectionLoader = (
  listId: string,
  projectionStore: ProjectionEventStore<TodoListEvent>
) => {
  const loader = loadProjection(TodoListProjectionEventStore, applyEvent);
  const loadEffect = loader(listId);
  return pipe(loadEffect, Effect.provideService(TodoListProjectionEventStore, projectionStore));
};

const loadProjectionForList = (
  projectionStore: ProjectionEventStore<TodoListEvent>,
  listId: string
) => applyProjectionLoader(listId, projectionStore);

export const loadTodoListProjection = () =>
  pipe(
    TodoListAggregate,
    Effect.map(makeProjectionEventStore),
    Effect.flatMap((projectionStore) => loadProjectionForList(projectionStore, TODO_LIST_ID))
  );
