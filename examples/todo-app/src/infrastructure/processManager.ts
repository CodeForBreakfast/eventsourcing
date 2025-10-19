import { Effect, Stream, pipe, Chunk, Schema } from 'effect';
import {
  AggregateState,
  provideCommandInitiator,
  EventRecord,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { EventBus, EventBusService } from './eventBus';
import { TodoCreated, TodoDeleted } from '../domain/todoEvents';
import { TodoListAggregateRoot, TodoListState } from '../domain/todoListAggregate';
import { TodoListEvent } from '../domain/todoListEvents';
import {
  TODO_LIST_ID,
  UserId,
  UserIdSchema,
  TodoId,
  TodoIdSchema,
  TodoListId,
} from '../domain/types';

const isTodoCreated = (event: unknown): event is EventRecord<TodoCreated, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoCreated';

const isTodoDeleted = (event: unknown): event is EventRecord<TodoDeleted, UserId> =>
  typeof event === 'object' && event !== null && 'type' in event && event.type === 'TodoDeleted';

const parseUserId = (userId: unknown): Effect.Effect<UserId, Error> =>
  pipe(
    userId,
    Schema.decodeUnknown(UserIdSchema),
    Effect.mapError(() => new Error(`Invalid UserId: ${String(userId)}`))
  );

const provideInitiatorFromUserId =
  <TResult, TError>(effect: Effect.Effect<TResult, TError>) =>
  (userId: UserId) =>
    pipe(effect, Effect.provide(provideCommandInitiator(userId)));

const withCommandInitiator =
  <TEvent extends EventRecord<unknown, UserId>, TResult, TError>(event: TEvent) =>
  (effect: Effect.Effect<TResult, TError>) =>
    pipe(event.metadata.origin, parseUserId, Effect.flatMap(provideInitiatorFromUserId(effect)));

const logPublishEvent = (event: TodoListEvent) =>
  Effect.logInfo(`[ProcessManager] Publishing event: ${event.type} to ${TODO_LIST_ID}`);

const publishSingleEvent =
  (eventBus: EventBusService) =>
  (event: TodoListEvent): Effect.Effect<void, never, never> => {
    const publishFn = eventBus.publish(TODO_LIST_ID);
    const publishThis = publishFn(event);
    return pipe(event, logPublishEvent, Effect.andThen(publishThis));
  };

const publishAllEvents =
  (eventBus: EventBusService) =>
  (
    events: Readonly<ReadonlyArray<TodoListEvent>>
  ): Effect.Effect<readonly void[], never, never> => {
    const publisher = publishSingleEvent(eventBus);
    return Effect.forEach(events, publisher);
  };

const logCommit = (count: number, id: TodoListId) =>
  Effect.logInfo(`[ProcessManager] Committing ${count} events to ${id}`);

const commitToAggregate = (
  id: TodoListId,
  eventNumber: number,
  events: Chunk.Chunk<TodoListEvent>
) =>
  TodoListAggregateRoot.commit({
    id,
    eventNumber,
    events,
  });

const commitAndPublishEvents =
  (eventBus: EventBusService) =>
  (id: TodoListId, eventNumber: number, events: Readonly<ReadonlyArray<TodoListEvent>>) => {
    const publish = publishAllEvents(eventBus);
    const commit = commitToAggregate(id, eventNumber, Chunk.fromIterable(events));
    return pipe(
      logCommit(events.length, id),
      Effect.andThen(commit),
      Effect.andThen(publish(events))
    );
  };

const commitEvents =
  (eventBus: EventBusService) =>
  (eventNumber: number) =>
  (events: Readonly<ReadonlyArray<TodoListEvent>>) => {
    const committer = commitAndPublishEvents(eventBus);
    return events.length === 0 ? Effect.void : committer(TODO_LIST_ID, eventNumber, events);
  };

const executeAndCommit = <TEvent extends EventRecord<unknown, UserId>, TError>(
  eventBus: EventBusService,
  state: Readonly<AggregateState<TodoListState>>,
  event: TEvent,
  command: Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) => {
  const commitWithBus = commitEvents(eventBus);
  const commit = commitWithBus(state.nextEventNumber);
  return pipe(command, withCommandInitiator(event), Effect.flatMap(commit));
};

const parseTodoId = (todoId: string): Effect.Effect<TodoId, Error> =>
  pipe(
    todoId,
    Schema.decode(TodoIdSchema),
    Effect.mapError(() => new Error(`Invalid TodoId: ${todoId}`))
  );

const handleCommand = <TEvent extends EventRecord<unknown, UserId>, TError>(
  eventBus: EventBusService,
  event: TEvent,
  buildCommand: (
    state: Readonly<AggregateState<TodoListState>>
  ) => Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) =>
  pipe(
    TODO_LIST_ID,
    TodoListAggregateRoot.load,
    Effect.flatMap((state) => executeAndCommit(eventBus, state, event, buildCommand(state)))
  );

const executeAddTodo =
  (eventBus: EventBusService) =>
  (event: Readonly<EventRecord<TodoCreated, UserId>>) =>
  (todoId: TodoId) =>
    handleCommand(eventBus, event, (state) =>
      pipe(state.data, TodoListAggregateRoot.commands.addTodo(todoId, event.data.title))
    );

const handleTodoCreated =
  (eventBus: EventBusService) =>
  (streamId: string, event: Readonly<EventRecord<TodoCreated, UserId>>) => {
    const executeWithBus = executeAddTodo(eventBus);
    const execute = executeWithBus(event);
    return pipe(streamId, parseTodoId, Effect.flatMap(execute));
  };

const executeRemoveTodo =
  (eventBus: EventBusService) =>
  (event: Readonly<EventRecord<TodoDeleted, UserId>>) =>
  (todoId: TodoId) =>
    handleCommand(eventBus, event, (state) =>
      pipe(state.data, TodoListAggregateRoot.commands.removeTodo(todoId))
    );

const handleTodoDeleted =
  (eventBus: EventBusService) =>
  (streamId: string, event: Readonly<EventRecord<TodoDeleted, UserId>>) => {
    const executeWithBus = executeRemoveTodo(eventBus);
    const execute = executeWithBus(event);
    return pipe(streamId, parseTodoId, Effect.flatMap(execute));
  };

const handleCreatedWithLogging =
  (eventBus: EventBusService) =>
  ({
    streamId,
    event,
  }: {
    readonly streamId: string;
    readonly event: EventRecord<TodoCreated, UserId>;
  }) => {
    const handle = handleTodoCreated(eventBus);
    return pipe(
      handle(streamId, event),
      Effect.catchAll((error) => Effect.logError(`Failed to handle TodoCreated: ${String(error)}`))
    );
  };

const handleDeletedWithLogging =
  (eventBus: EventBusService) =>
  ({
    streamId,
    event,
  }: {
    readonly streamId: string;
    readonly event: EventRecord<TodoDeleted, UserId>;
  }) => {
    const handle = handleTodoDeleted(eventBus);
    return pipe(
      handle(streamId, event),
      Effect.catchAll((error) => Effect.logError(`Failed to handle TodoDeleted: ${String(error)}`))
    );
  };

const runCreatedStream =
  (eventBus: EventBusService) =>
  (
    stream: Stream.Stream<
      { readonly streamId: string; readonly event: EventRecord<TodoCreated, UserId> },
      unknown,
      unknown
    >
  ) =>
    pipe(stream, Stream.mapEffect(handleCreatedWithLogging(eventBus)), Stream.runDrain);

const runDeletedStream =
  (eventBus: EventBusService) =>
  (
    stream: Stream.Stream<
      { readonly streamId: string; readonly event: EventRecord<TodoDeleted, UserId> },
      unknown,
      unknown
    >
  ) =>
    pipe(stream, Stream.mapEffect(handleDeletedWithLogging(eventBus)), Stream.runDrain);

const subscribeToStreams = (eventBus: EventBusService) =>
  Effect.all([eventBus.subscribe(isTodoCreated), eventBus.subscribe(isTodoDeleted)]);

const runBothStreams =
  (eventBus: EventBusService) =>
  ([createdStream, deletedStream]: readonly [
    Stream.Stream<
      { readonly streamId: string; readonly event: EventRecord<TodoCreated, UserId> },
      unknown,
      unknown
    >,
    Stream.Stream<
      { readonly streamId: string; readonly event: EventRecord<TodoDeleted, UserId> },
      unknown,
      unknown
    >,
  ]) => {
    const runCreated = runCreatedStream(eventBus);
    const runDeleted = runDeletedStream(eventBus);
    return Effect.all([runCreated(createdStream), runDeleted(deletedStream)], {
      concurrency: 'unbounded',
    });
  };

const processEventBus = (eventBus: EventBusService) =>
  pipe(eventBus, subscribeToStreams, Effect.flatMap(runBothStreams(eventBus)));

export const startProcessManager = () => pipe(EventBus, Effect.flatMap(processEventBus));
