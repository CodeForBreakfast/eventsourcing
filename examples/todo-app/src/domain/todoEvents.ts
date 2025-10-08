import { Schema } from 'effect';

export const TodoCreated = Schema.Struct({
  type: Schema.Literal('TodoCreated'),
  data: Schema.Struct({
    title: Schema.String,
    createdAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoCreated = typeof TodoCreated.Type;

export const TodoTitleChanged = Schema.Struct({
  type: Schema.Literal('TodoTitleChanged'),
  data: Schema.Struct({
    title: Schema.String,
    changedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoTitleChanged = typeof TodoTitleChanged.Type;

export const TodoCompleted = Schema.Struct({
  type: Schema.Literal('TodoCompleted'),
  data: Schema.Struct({
    completedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoCompleted = typeof TodoCompleted.Type;

export const TodoUncompleted = Schema.Struct({
  type: Schema.Literal('TodoUncompleted'),
  data: Schema.Struct({
    uncompletedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoUncompleted = typeof TodoUncompleted.Type;

export const TodoDeleted = Schema.Struct({
  type: Schema.Literal('TodoDeleted'),
  data: Schema.Struct({
    deletedAt: Schema.ValidDateFromSelf,
  }),
});
export type TodoDeleted = typeof TodoDeleted.Type;

export const TodoEvent = Schema.Union(
  TodoCreated,
  TodoTitleChanged,
  TodoCompleted,
  TodoUncompleted,
  TodoDeleted
);
export type TodoEvent = typeof TodoEvent.Type;
