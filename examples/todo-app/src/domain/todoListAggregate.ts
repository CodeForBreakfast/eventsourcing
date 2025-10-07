import { Effect, Option, Schema, pipe } from 'effect';
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { TodoId, UserId } from './types';
import { TodoListEvent, TodoAddedToList, TodoRemovedFromList } from './todoListEvents';

export interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}

export class TodoListAggregate extends Effect.Tag('TodoListAggregate')<
  TodoListAggregate,
  EventStore<TodoListEvent>
>() {}

const applyEvent =
  (state: Readonly<Option.Option<TodoListState>>) =>
  (event: Readonly<TodoListEvent>): Effect.Effect<TodoListState, never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (event.type === 'TodoAddedToList') {
      const newTodoIds = new Set<TodoId>([...currentState.todoIds, event.data.todoId]);
      return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
    }

    if (event.type === 'TodoRemovedFromList') {
      const newTodoIds = new Set<TodoId>(
        [...currentState.todoIds].filter((id) => id !== event.data.todoId)
      );
      return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
    }

    return Effect.succeed<TodoListState>(currentState);
  };

const addTodo =
  (userId: UserId, todoId: TodoId, title: string) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoAddedToList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (currentState.todoIds.has(todoId)) {
      return Effect.succeed([]);
    }

    return Effect.succeed([
      {
        type: 'TodoAddedToList' as const,
        metadata: { occurredAt: new Date(), originator: userId },
        data: { todoId, title, addedAt: new Date() },
      } satisfies TodoAddedToList,
    ]);
  };

const removeTodo =
  (userId: UserId, todoId: TodoId) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoRemovedFromList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (!currentState.todoIds.has(todoId)) {
      return Effect.succeed([]);
    }

    return Effect.succeed([
      {
        type: 'TodoRemovedFromList' as const,
        metadata: { occurredAt: new Date(), originator: userId },
        data: { todoId, removedAt: new Date() },
      } satisfies TodoRemovedFromList,
    ]);
  };

export const TodoListAggregateRoot = makeAggregateRoot(
  pipe(Schema.String, Schema.brand('TodoListId')),
  Schema.String,
  applyEvent,
  TodoListAggregate,
  {
    addTodo,
    removeTodo,
  }
);
