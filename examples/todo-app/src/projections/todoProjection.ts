import { Context, Effect, Option, pipe } from 'effect';
import {
  loadProjection,
  makeProjectionEventStore,
  ProjectionEventStore,
} from '@codeforbreakfast/eventsourcing-projections';
import { TodoId } from '../domain/types';
import { TodoEvent } from '../domain/todoEvents';
import { TodoAggregate } from '../domain/todoAggregate';

export interface TodoProjection {
  readonly id: TodoId;
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const applyEvent =
  (todoId: TodoId) =>
  (state: Readonly<Option.Option<TodoProjection>>) =>
  (event: Readonly<TodoEvent>) => {
    if (event.type === 'TodoCreated') {
      return Effect.succeed({
        id: todoId,
        title: event.data.title,
        completed: false,
        deleted: false,
        createdAt: event.data.createdAt,
        updatedAt: event.data.createdAt,
      });
    }

    return Option.match(state, {
      onNone: () =>
        Effect.succeed({
          id: todoId,
          title: '',
          completed: false,
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      onSome: (currentState) => {
        switch (event.type) {
          case 'TodoTitleChanged':
            return Effect.succeed({
              ...currentState,
              title: event.data.title,
              updatedAt: event.data.changedAt,
            });

          case 'TodoCompleted':
            return Effect.succeed({
              ...currentState,
              completed: true,
              updatedAt: event.data.completedAt,
            });

          case 'TodoUncompleted':
            return Effect.succeed({
              ...currentState,
              completed: false,
              updatedAt: event.data.uncompletedAt,
            });

          case 'TodoDeleted':
            return Effect.succeed({
              ...currentState,
              deleted: true,
              updatedAt: event.data.deletedAt,
            });

          default:
            return Effect.succeed(currentState);
        }
      },
    });
  };

const TodoProjectionEventStore = Context.GenericTag<ProjectionEventStore<TodoEvent>>(
  'TodoProjectionEventStore'
);

const loadTodoProjectionEffect = (todoId: TodoId) =>
  loadProjection(TodoProjectionEventStore, applyEvent(todoId))(todoId);

const loadProjectionWithStore =
  (todoId: TodoId) => (projectionStore: ProjectionEventStore<TodoEvent>) =>
    pipe(
      loadTodoProjectionEffect(todoId),
      Effect.provideService(TodoProjectionEventStore, projectionStore)
    );

export const loadTodoProjection = (todoId: TodoId) =>
  pipe(
    TodoAggregate,
    Effect.map(makeProjectionEventStore),
    Effect.flatMap(loadProjectionWithStore(todoId))
  );
