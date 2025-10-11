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
import { TODO_LIST_ID, UserId, UserIdSchema, TodoId, TodoIdSchema } from '../domain/types';

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

const commitEvents = (eventNumber: number) => (events: Readonly<ReadonlyArray<TodoListEvent>>) =>
  events.length > 0
    ? TodoListAggregateRoot.commit({
        id: TODO_LIST_ID,
        eventNumber,
        events: Chunk.fromIterable(events),
      })
    : Effect.void;

const executeAndCommit = <TEvent extends EventRecord<unknown, UserId>, TError>(
  state: Readonly<AggregateState<TodoListState>>,
  event: TEvent,
  command: Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) =>
  pipe(command, withCommandInitiator(event), Effect.flatMap(commitEvents(state.nextEventNumber)));

const parseTodoId = (todoId: string): Effect.Effect<TodoId, Error> =>
  pipe(
    todoId,
    Schema.decode(TodoIdSchema),
    Effect.mapError(() => new Error(`Invalid TodoId: ${todoId}`))
  );

const handleCommand = <TEvent extends EventRecord<unknown, UserId>, TError>(
  event: TEvent,
  buildCommand: (
    state: Readonly<AggregateState<TodoListState>>
  ) => Effect.Effect<ReadonlyArray<TodoListEvent>, TError>
) =>
  pipe(
    TODO_LIST_ID,
    TodoListAggregateRoot.load,
    Effect.flatMap((state) => executeAndCommit(state, event, buildCommand(state)))
  );

const executeAddTodo = (event: Readonly<EventRecord<TodoCreated, UserId>>) => (todoId: TodoId) =>
  handleCommand(event, (state) =>
    pipe(state.data, TodoListAggregateRoot.commands.addTodo(todoId, event.data.title))
  );

const handleTodoCreated = (streamId: string, event: Readonly<EventRecord<TodoCreated, UserId>>) =>
  pipe(streamId, parseTodoId, Effect.flatMap(executeAddTodo(event)));

const executeRemoveTodo = (event: Readonly<EventRecord<TodoDeleted, UserId>>) => (todoId: TodoId) =>
  handleCommand(event, (state) =>
    pipe(state.data, TodoListAggregateRoot.commands.removeTodo(todoId))
  );

const handleTodoDeleted = (streamId: string, event: Readonly<EventRecord<TodoDeleted, UserId>>) =>
  pipe(streamId, parseTodoId, Effect.flatMap(executeRemoveTodo(event)));

const handleCreatedWithLogging = ({
  streamId,
  event,
}: {
  readonly streamId: string;
  readonly event: EventRecord<TodoCreated, UserId>;
}) =>
  pipe(
    handleTodoCreated(streamId, event),
    Effect.catchAll((error) => Effect.logError(`Failed to handle TodoCreated: ${String(error)}`))
  );

const handleDeletedWithLogging = ({
  streamId,
  event,
}: {
  readonly streamId: string;
  readonly event: EventRecord<TodoDeleted, UserId>;
}) =>
  pipe(
    handleTodoDeleted(streamId, event),
    Effect.catchAll((error) => Effect.logError(`Failed to handle TodoDeleted: ${String(error)}`))
  );

const runCreatedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoCreated, UserId> },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleCreatedWithLogging), Stream.runDrain);

const runDeletedStream = (
  stream: Stream.Stream<
    { readonly streamId: string; readonly event: EventRecord<TodoDeleted, UserId> },
    unknown,
    unknown
  >
) => pipe(stream, Stream.mapEffect(handleDeletedWithLogging), Stream.runDrain);

const subscribeToStreams = (eventBus: EventBusService) =>
  Effect.all([eventBus.subscribe(isTodoCreated), eventBus.subscribe(isTodoDeleted)]);

const runBothStreams = ([createdStream, deletedStream]: readonly [
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
]) =>
  Effect.all([runCreatedStream(createdStream), runDeletedStream(deletedStream)], {
    concurrency: 'unbounded',
  });

const processEventBus = (eventBus: EventBusService) =>
  pipe(eventBus, subscribeToStreams, Effect.flatMap(runBothStreams));

export const startProcessManager = () => pipe(EventBus, Effect.flatMap(processEventBus));
