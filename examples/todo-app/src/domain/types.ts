import { Schema } from 'effect';

export const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
export type TodoId = typeof TodoId.Type;

export const UserId = Schema.String.pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export const TODO_LIST_ID = 'singleton-todo-list' as const;
