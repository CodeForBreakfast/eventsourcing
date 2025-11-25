import { describe, it, expect } from '@codeforbreakfast/bun-test-effect';
import { Effect, Option, pipe } from 'effect';
import { TodoListAggregateRoot } from '../src/domain/todoListAggregate';
import { TodoId } from '../src/domain/types';

const TEST_TODO_ID = 'todo-123' as TodoId;

describe('TodoListAggregate', () => {
  describe('addTodo', () => {
    it.effect('should add a new TODO to an empty list', () => {
      const state = Option.none();
      return pipe(
        state,
        TodoListAggregateRoot.commands.addTodo(TEST_TODO_ID, 'Buy milk'),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          if (!events[0]) {
            throw new Error('Expected first event');
          }
          const firstEvent = events[0];
          expect(firstEvent.type).toBe('TodoAddedToList');
          expect(firstEvent.data.todoId).toBe(TEST_TODO_ID);
          expect(firstEvent.data.title).toBe('Buy milk');
        })
      );
    });

    it.effect('should add a new TODO to an existing list', () => {
      const state = Option.some({
        todoIds: new Set(['todo-1' as TodoId]),
      });
      return pipe(
        state,
        TodoListAggregateRoot.commands.addTodo(TEST_TODO_ID, 'Buy bread'),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          if (!events[0]) {
            throw new Error('Expected first event');
          }
          const firstEvent = events[0];
          expect(firstEvent.data.todoId).toBe(TEST_TODO_ID);
        })
      );
    });

    it.effect('should return empty events when TODO already exists in list', () => {
      const state = Option.some({
        todoIds: new Set([TEST_TODO_ID]),
      });
      return pipe(
        state,
        TodoListAggregateRoot.commands.addTodo(TEST_TODO_ID, 'Buy milk'),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });
  });

  describe('removeTodo', () => {
    it.effect('should remove an existing TODO from the list', () => {
      const state = Option.some({
        todoIds: new Set([TEST_TODO_ID]),
      });
      return pipe(
        state,
        TodoListAggregateRoot.commands.removeTodo(TEST_TODO_ID),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          if (!events[0]) {
            throw new Error('Expected first event');
          }
          const firstEvent = events[0];
          expect(firstEvent.type).toBe('TodoRemovedFromList');
          expect(firstEvent.data.todoId).toBe(TEST_TODO_ID);
        })
      );
    });

    it.effect('should return empty events when TODO does not exist in list', () => {
      const state = Option.some({
        todoIds: new Set<TodoId>(),
      });
      return pipe(
        state,
        TodoListAggregateRoot.commands.removeTodo(TEST_TODO_ID),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });

    it.effect('should return empty events when list is empty', () => {
      const state = Option.none();
      return pipe(
        state,
        TodoListAggregateRoot.commands.removeTodo(TEST_TODO_ID),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });
  });
});
