import { Effect, Option, ParseResult, Schema, pipe } from 'effect';
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';
import { TodoId, UserId } from './types';
import {
  TodoEvent,
  TodoCreated,
  TodoTitleChanged,
  TodoCompleted,
  TodoUncompleted,
  TodoDeleted,
} from './todoEvents';

export interface TodoState {
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
}

export class TodoAggregate extends Effect.Tag('TodoAggregate')<
  TodoAggregate,
  EventStore<TodoEvent>
>() {}

const applyEvent =
  (state: Readonly<Option.Option<TodoState>>) =>
  (event: Readonly<TodoEvent>): Effect.Effect<TodoState, ParseResult.ParseError> => {
    if (event.type === 'TodoCreated') {
      return Effect.succeed({
        title: event.data.title,
        completed: false,
        deleted: false,
      });
    }

    return pipe(
      state,
      Option.match({
        onNone: () =>
          Effect.fail(
            new ParseResult.ParseError({
              issue: new ParseResult.Type(
                Schema.String.ast,
                'Cannot apply event to non-existent TODO'
              ),
            })
          ),
        onSome: (currentState) => {
          switch (event.type) {
            case 'TodoTitleChanged':
              return Effect.succeed({
                ...currentState,
                title: event.data.title,
              });

            case 'TodoCompleted':
              return Effect.succeed({
                ...currentState,
                completed: true,
              });

            case 'TodoUncompleted':
              return Effect.succeed({
                ...currentState,
                completed: false,
              });

            case 'TodoDeleted':
              return Effect.succeed({
                ...currentState,
                deleted: true,
              });

            default:
              return Effect.succeed(currentState);
          }
        },
      })
    );
  };

const createTodo = (userId: UserId, title: string) => () =>
  Effect.succeed([
    {
      type: 'TodoCreated' as const,
      metadata: { occurredAt: new Date(), originator: userId },
      data: { title, createdAt: new Date() },
    } satisfies TodoCreated,
  ]);

const changeTitle =
  (userId: UserId, title: string) => (state: Readonly<Option.Option<TodoState>>) =>
    pipe(
      state,
      Option.match({
        onNone: () => Effect.fail(new Error('Cannot change title of non-existent TODO')),
        onSome: (current) =>
          current.deleted
            ? Effect.fail(new Error('Cannot change title of deleted TODO'))
            : Effect.succeed([
                {
                  type: 'TodoTitleChanged' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { title, changedAt: new Date() },
                } satisfies TodoTitleChanged,
              ]),
      })
    );

const complete = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot complete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.fail(new Error('Cannot complete deleted TODO'))
          : current.completed
            ? Effect.succeed([])
            : Effect.succeed([
                {
                  type: 'TodoCompleted' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { completedAt: new Date() },
                } satisfies TodoCompleted,
              ]),
    })
  );

const uncomplete = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot uncomplete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.fail(new Error('Cannot uncomplete deleted TODO'))
          : !current.completed
            ? Effect.succeed([])
            : Effect.succeed([
                {
                  type: 'TodoUncompleted' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { uncompletedAt: new Date() },
                } satisfies TodoUncompleted,
              ]),
    })
  );

const deleteTodo = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot delete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.succeed([])
          : Effect.succeed([
              {
                type: 'TodoDeleted' as const,
                metadata: { occurredAt: new Date(), originator: userId },
                data: { deletedAt: new Date() },
              } satisfies TodoDeleted,
            ]),
    })
  );

export const TodoAggregateRoot = makeAggregateRoot(
  TodoId,
  Schema.String,
  applyEvent,
  TodoAggregate,
  {
    createTodo,
    changeTitle,
    complete,
    uncomplete,
    deleteTodo,
  }
);
