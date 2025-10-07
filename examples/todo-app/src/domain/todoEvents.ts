import { Schema } from 'effect';
import { eventSchema } from '@codeforbreakfast/eventsourcing-aggregates';

export const TodoCreated = eventSchema(Schema.String, Schema.Literal('TodoCreated'), {
  title: Schema.String,
  createdAt: Schema.ValidDateFromSelf,
});
export type TodoCreated = typeof TodoCreated.Type;

export const TodoTitleChanged = eventSchema(Schema.String, Schema.Literal('TodoTitleChanged'), {
  title: Schema.String,
  changedAt: Schema.ValidDateFromSelf,
});
export type TodoTitleChanged = typeof TodoTitleChanged.Type;

export const TodoCompleted = eventSchema(Schema.String, Schema.Literal('TodoCompleted'), {
  completedAt: Schema.ValidDateFromSelf,
});
export type TodoCompleted = typeof TodoCompleted.Type;

export const TodoUncompleted = eventSchema(Schema.String, Schema.Literal('TodoUncompleted'), {
  uncompletedAt: Schema.ValidDateFromSelf,
});
export type TodoUncompleted = typeof TodoUncompleted.Type;

export const TodoDeleted = eventSchema(Schema.String, Schema.Literal('TodoDeleted'), {
  deletedAt: Schema.ValidDateFromSelf,
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
