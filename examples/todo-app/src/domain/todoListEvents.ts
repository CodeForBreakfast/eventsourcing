import { Schema } from 'effect';
import { TodoId } from './types';

export const TodoAddedToList = Schema.Struct({
  type: Schema.Literal('TodoAddedToList'),
  data: Schema.Struct({
    todoId: TodoId,
    title: Schema.String,
    addedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoAddedToList = typeof TodoAddedToList.Type;

export const TodoRemovedFromList = Schema.Struct({
  type: Schema.Literal('TodoRemovedFromList'),
  data: Schema.Struct({
    todoId: TodoId,
    removedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoRemovedFromList = typeof TodoRemovedFromList.Type;

export const TodoListEvent = Schema.Union(TodoAddedToList, TodoRemovedFromList);
export type TodoListEvent = typeof TodoListEvent.Type;
