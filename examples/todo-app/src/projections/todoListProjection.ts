import { Context, Effect, Option, pipe } from 'effect';
import {
  loadProjection,
  makeProjectionEventStore,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';
import { type EventRecord } from '@codeforbreakfast/eventsourcing-aggregates';
import { TodoId, TODO_LIST_ID, UserId } from '../domain/types';
import { TodoListEvent } from '../domain/todoListEvents';
import { TodoListAggregate } from '../domain/todoListAggregate';

// eslint-disable-next-line functional/type-declaration-immutability -- Branded types with Date properties are detected as ReadonlyShallow by eslint-plugin-functional
export interface TodoListItem {
  readonly todoId: TodoId;
  readonly title: string;
  readonly addedAt: Readonly<Date>;
}

export interface TodoListProjection {
  readonly todos: readonly TodoListItem[];
}

const applyEvent =
  (state: Readonly<Option.Option<TodoListProjection>>) =>
  (
    event: Readonly<EventRecord<TodoListEvent, UserId>>
  ): Effect.Effect<TodoListProjection, never> => {
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

const TodoListProjectionEventStore = Context.GenericTag<
  ProjectionEventStore<EventRecord<TodoListEvent, UserId>>
>('TodoListProjectionEventStore');

const applyProjectionLoader = (
  listId: string,
  projectionStore: ProjectionEventStore<EventRecord<TodoListEvent, UserId>>
) => {
  const loader = loadProjection(TodoListProjectionEventStore, applyEvent);
  const loadEffect = loader(listId);
  return pipe(loadEffect, Effect.provideService(TodoListProjectionEventStore, projectionStore));
};

const loadProjectionForList = (
  projectionStore: ProjectionEventStore<EventRecord<TodoListEvent, UserId>>,
  listId: string
) => applyProjectionLoader(listId, projectionStore);

export const loadTodoListProjection = () =>
  pipe(
    TodoListAggregate,
    Effect.map(makeProjectionEventStore),
    Effect.flatMap((projectionStore) => loadProjectionForList(projectionStore, TODO_LIST_ID))
  );
