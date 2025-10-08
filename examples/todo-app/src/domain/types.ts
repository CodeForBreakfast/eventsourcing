import { pipe, Schema } from 'effect';

export const TodoIdSchema = pipe(Schema.String, Schema.brand('TodoId'));
export type TodoId = typeof TodoIdSchema.Type;
export const TodoId = TodoIdSchema;

export const UserIdSchema = pipe(Schema.String, Schema.brand('UserId'));
export type UserId = typeof UserIdSchema.Type;
export const UserId = UserIdSchema;

export const TodoListIdSchema = pipe(Schema.String, Schema.brand('TodoListId'));
export type TodoListId = typeof TodoListIdSchema.Type;
export const TodoListId = TodoListIdSchema;

export const TODO_LIST_ID = 'singleton-todo-list' as TodoListId;
