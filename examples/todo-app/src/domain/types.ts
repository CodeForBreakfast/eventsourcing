import { pipe, Schema } from 'effect';

export const TodoId = pipe(Schema.String, Schema.brand('TodoId'));
export type TodoId = typeof TodoId.Type;

export const UserId = pipe(Schema.String, Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export const TODO_LIST_ID = 'singleton-todo-list' as const;
