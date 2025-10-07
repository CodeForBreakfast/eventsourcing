import { Schema } from 'effect';
import { eventSchema } from '@codeforbreakfast/eventsourcing-aggregates';
import { TodoId } from './types';

export const TodoAddedToList = eventSchema(Schema.String, Schema.Literal('TodoAddedToList'), {
  todoId: TodoId,
  title: Schema.String,
  addedAt: Schema.ValidDateFromSelf,
});
export type TodoAddedToList = typeof TodoAddedToList.Type;

export const TodoRemovedFromList = eventSchema(
  Schema.String,
  Schema.Literal('TodoRemovedFromList'),
  {
    todoId: TodoId,
    removedAt: Schema.ValidDateFromSelf,
  }
);
export type TodoRemovedFromList = typeof TodoRemovedFromList.Type;

export const TodoListEvent = Schema.Union(TodoAddedToList, TodoRemovedFromList);
export type TodoListEvent = typeof TodoListEvent.Type;
