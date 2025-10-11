import { Effect, Match, Option, pipe } from 'effect';
import { makeAggregateRoot, type EventRecord } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { TodoId, UserId, UserIdSchema, TodoListIdSchema } from './types';
import { TodoListEvent, TodoAddedToList, TodoRemovedFromList } from './todoListEvents';

export interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}

export class TodoListAggregate extends Effect.Tag('TodoListAggregate')<
  TodoListAggregate,
  EventStore<EventRecord<TodoListEvent, UserId>>
>() {}

const applyEvent =
  (state: Readonly<Option.Option<TodoListState>>) =>
  (event: Readonly<TodoListEvent>): Effect.Effect<TodoListState, never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    return pipe(
      event,
      Match.value,
      Match.when({ type: 'TodoAddedToList' }, (event) => {
        const newTodoIds = new Set<TodoId>([...currentState.todoIds, event.data.todoId]);
        return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
      }),
      Match.when({ type: 'TodoRemovedFromList' }, (event) => {
        const newTodoIds = new Set<TodoId>(
          [...currentState.todoIds].filter((id) => id !== event.data.todoId)
        );
        return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
      }),
      Match.orElse(() => Effect.succeed<TodoListState>(currentState))
    );
  };

const addTodo =
  (todoId: TodoId, title: string) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoAddedToList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    return Effect.if(currentState.todoIds.has(todoId), {
      onTrue: () => Effect.succeed([]),
      onFalse: () =>
        Effect.succeed([
          {
            type: 'TodoAddedToList' as const,
            data: { todoId, title, addedAt: new Date() },
          } satisfies TodoAddedToList,
        ]),
    });
  };

const removeTodo =
  (todoId: TodoId) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoRemovedFromList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    return Effect.if(!currentState.todoIds.has(todoId), {
      onTrue: () => Effect.succeed([]),
      onFalse: () =>
        Effect.succeed([
          {
            type: 'TodoRemovedFromList' as const,
            data: { todoId, removedAt: new Date() },
          } satisfies TodoRemovedFromList,
        ]),
    });
  };

export const TodoListAggregateRoot = makeAggregateRoot(
  TodoListIdSchema,
  UserIdSchema,
  applyEvent,
  TodoListAggregate,
  {
    addTodo,
    removeTodo,
  }
);
