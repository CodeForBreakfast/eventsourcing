import { Context, Effect, Match, Option, pipe } from 'effect';
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

const applyEventToExistingState = (
  currentState: TodoProjection,
  event: Readonly<TodoEvent>
): Effect.Effect<TodoProjection> =>
  pipe(
    event,
    Match.value,
    Match.when({ type: 'TodoTitleChanged' }, (event) =>
      Effect.succeed({
        ...currentState,
        title: event.data.title,
        updatedAt: event.data.changedAt,
      })
    ),
    Match.when({ type: 'TodoCompleted' }, (event) =>
      Effect.succeed({
        ...currentState,
        completed: true,
        updatedAt: event.data.completedAt,
      })
    ),
    Match.when({ type: 'TodoUncompleted' }, (event) =>
      Effect.succeed({
        ...currentState,
        completed: false,
        updatedAt: event.data.uncompletedAt,
      })
    ),
    Match.when({ type: 'TodoDeleted' }, (event) =>
      Effect.succeed({
        ...currentState,
        deleted: true,
        updatedAt: event.data.deletedAt,
      })
    ),
    Match.orElse(() => Effect.succeed(currentState))
  );

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
      onSome: (currentState) => applyEventToExistingState(currentState, event),
    });
  };

const TodoProjectionEventStore = Context.GenericTag<ProjectionEventStore<TodoEvent>>(
  'TodoProjectionEventStore'
);

const applyProjectionLoader =
  (todoId: TodoId) => (projectionStore: ProjectionEventStore<TodoEvent>) => {
    const appliedEvent = applyEvent(todoId);
    const loader = loadProjection(TodoProjectionEventStore, appliedEvent);
    const loadEffect = loader(todoId);
    return pipe(loadEffect, Effect.provideService(TodoProjectionEventStore, projectionStore));
  };

export const loadTodoProjection = (todoId: TodoId) =>
  pipe(
    TodoAggregate,
    Effect.map(makeProjectionEventStore),
    Effect.flatMap(applyProjectionLoader(todoId))
  );
