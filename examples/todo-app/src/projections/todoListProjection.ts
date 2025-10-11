import { Context, Effect, Match, Option, pipe } from 'effect';
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
  (event: Readonly<TodoListEvent>): Effect.Effect<TodoListProjection, never> => {
    const currentState = Option.getOrElse(state, () => ({ todos: [] }));

    return pipe(
      event,
      Match.value,
      Match.when({ type: 'TodoAddedToList' }, (event) => {
        const existingIndex = currentState.todos.findIndex((t) => t.todoId === event.data.todoId);
        return Effect.if(existingIndex >= 0, {
          onTrue: () => Effect.succeed(currentState),
          onFalse: () =>
            Effect.succeed({
              todos: [
                ...currentState.todos,
                {
                  todoId: event.data.todoId,
                  title: event.data.title,
                  addedAt: event.data.addedAt,
                },
              ],
            }),
        });
      }),
      Match.when({ type: 'TodoRemovedFromList' }, (event) =>
        Effect.succeed({
          todos: currentState.todos.filter((t) => t.todoId !== event.data.todoId),
        })
      ),
      Match.orElse(() => Effect.succeed(currentState))
    );
  };

const TodoListProjectionEventStore = Context.GenericTag<
  ProjectionEventStore<EventRecord<TodoListEvent, UserId>>
>('TodoListProjectionEventStore');

const applyProjectionLoader =
  (listId: string) => (projectionStore: ProjectionEventStore<EventRecord<TodoListEvent, UserId>>) =>
    pipe(
      listId,
      loadProjection(TodoListProjectionEventStore, applyEvent),
      Effect.provideService(TodoListProjectionEventStore, projectionStore)
    );

export const loadTodoListProjection = () =>
  pipe(
    TodoListAggregate,
    Effect.map(makeProjectionEventStore),
    Effect.flatMap(applyProjectionLoader(TODO_LIST_ID))
  );
