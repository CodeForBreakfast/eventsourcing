import { Effect, Match, Option, ParseResult, Schema, pipe } from 'effect';
import { eventMetadata, makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
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

const applyEventToExistingState = (
  currentState: TodoState,
  event: Readonly<TodoEvent>
): Effect.Effect<TodoState, ParseResult.ParseError> =>
  pipe(
    event,
    Match.value,
    Match.when({ type: 'TodoTitleChanged' }, (event) =>
      Effect.succeed({
        ...currentState,
        title: event.data.title,
      })
    ),
    Match.when({ type: 'TodoCompleted' }, () =>
      Effect.succeed({
        ...currentState,
        completed: true,
      })
    ),
    Match.when({ type: 'TodoUncompleted' }, () =>
      Effect.succeed({
        ...currentState,
        completed: false,
      })
    ),
    Match.when({ type: 'TodoDeleted' }, () =>
      Effect.succeed({
        ...currentState,
        deleted: true,
      })
    ),
    Match.orElse(() => Effect.succeed(currentState))
  );

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
        onSome: (currentState) => applyEventToExistingState(currentState, event),
      })
    );
  };

const requireExistingTodo = <A, E, R>(
  operation: string,
  onSome: (state: TodoState) => Effect.Effect<A, E, R>
): ((state: Readonly<Option.Option<TodoState>>) => Effect.Effect<A, E | Error, R>) =>
  Option.match({
    onNone: () => Effect.fail(new Error(`Cannot ${operation} non-existent TODO`)),
    onSome,
  });

const failIfDeletedTodo =
  (operation: string) =>
  (state: TodoState): Effect.Effect<TodoState, Error> =>
    state.deleted
      ? Effect.fail(new Error(`Cannot ${operation} deleted TODO`))
      : Effect.succeed(state);

const createTodo = (title: string) => () =>
  pipe(
    eventMetadata<UserId>(),
    Effect.map((metadata) => [
      {
        type: 'TodoCreated' as const,
        metadata,
        data: { title, createdAt: new Date() },
      } satisfies TodoCreated,
    ])
  );

const createTodoTitleChangedEvent = (title: string) =>
  pipe(
    eventMetadata<UserId>(),
    Effect.map((metadata) => [
      {
        type: 'TodoTitleChanged' as const,
        metadata,
        data: { title, changedAt: new Date() },
      } satisfies TodoTitleChanged,
    ])
  );

const changeTitle = (title: string) =>
  requireExistingTodo('change title', (current) =>
    pipe(
      current,
      failIfDeletedTodo('change title'),
      Effect.andThen(createTodoTitleChangedEvent(title))
    )
  );

const createCompletedEventWithMetadata = (metadata: {
  readonly occurredAt: Date;
  readonly originator: string;
}) => [
  {
    type: 'TodoCompleted' as const,
    metadata,
    data: { completedAt: new Date() },
  } satisfies TodoCompleted,
];

const createTodoCompletedEvent = () =>
  pipe(eventMetadata<UserId>(), Effect.map(createCompletedEventWithMetadata));

const createCompletedEventIfNeeded = (state: TodoState) =>
  state.completed ? Effect.succeed([]) : createTodoCompletedEvent();

const complete = () =>
  requireExistingTodo('complete', (current) =>
    pipe(current, failIfDeletedTodo('complete'), Effect.flatMap(createCompletedEventIfNeeded))
  );

const createUncompletedEventWithMetadata = (metadata: {
  readonly occurredAt: Date;
  readonly originator: string;
}) => [
  {
    type: 'TodoUncompleted' as const,
    metadata,
    data: { uncompletedAt: new Date() },
  } satisfies TodoUncompleted,
];

const createTodoUncompletedEvent = () =>
  pipe(eventMetadata<UserId>(), Effect.map(createUncompletedEventWithMetadata));

const createUncompletedEventIfNeeded = (state: TodoState) =>
  state.completed ? createTodoUncompletedEvent() : Effect.succeed([]);

const uncomplete = () =>
  requireExistingTodo('uncomplete', (current) =>
    pipe(current, failIfDeletedTodo('uncomplete'), Effect.flatMap(createUncompletedEventIfNeeded))
  );

const createDeletedEventWithMetadata = (metadata: {
  readonly occurredAt: Date;
  readonly originator: string;
}) => [
  {
    type: 'TodoDeleted' as const,
    metadata,
    data: { deletedAt: new Date() },
  } satisfies TodoDeleted,
];

const createTodoDeletedEvent = () =>
  pipe(eventMetadata<UserId>(), Effect.map(createDeletedEventWithMetadata));

const deleteTodo = () =>
  requireExistingTodo('delete', (current) =>
    current.deleted ? Effect.succeed([]) : createTodoDeletedEvent()
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
