#!/usr/bin/env bun

import { Effect, Layer, Console, Option, Chunk, pipe } from 'effect';
import { Projection } from '@codeforbreakfast/eventsourcing-projections';
import {
  makeInMemoryEventStore,
  InMemoryStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import { TodoAggregate, TodoAggregateRoot, TodoState } from './domain/todoAggregate';
import { TodoListAggregate } from './domain/todoListAggregate';
import { EventBus, EventBusService, makeEventBus } from './infrastructure/eventBus';
import { startProcessManager } from './infrastructure/processManager';
import { loadTodoProjection } from './projections/todoProjection';
import { loadTodoListProjection, TodoListProjection } from './projections/todoListProjection';
import { TodoId, UserId } from './domain/types';
import type { TodoEvent } from './domain/todoEvents';
import type { TodoListEvent } from './domain/todoListEvents';

const CURRENT_USER = 'user-1' as UserId;

const EventBusLive = Layer.effect(EventBus, makeEventBus());

const TodoEventStoreLive = Layer.effect(
  TodoAggregate,
  pipe(InMemoryStore.make<TodoEvent>(), Effect.flatMap(makeInMemoryEventStore))
);

const TodoListEventStoreLive = Layer.effect(
  TodoListAggregate,
  pipe(InMemoryStore.make<TodoListEvent>(), Effect.flatMap(makeInMemoryEventStore))
);

const AppLive = Layer.mergeAll(EventBusLive, TodoEventStoreLive, TodoListEventStoreLive);

const publishEventsWithBus =
  (todoId: TodoId, events: ReadonlyArray<TodoEvent>) => (eventBus: Readonly<EventBusService>) =>
    pipe(
      events,
      Effect.forEach((event) => eventBus.publish(todoId, event))
    );

const publishEvents = (todoId: TodoId, events: ReadonlyArray<TodoEvent>) =>
  pipe(EventBus, Effect.flatMap(publishEventsWithBus(todoId, events)));

const commitTodoEvents = (
  todoId: TodoId,
  eventNumber: number,
  events: Readonly<ReadonlyArray<TodoEvent>>
) =>
  TodoAggregateRoot.commit({
    id: todoId,
    eventNumber,
    events: Chunk.fromIterable(events),
  });

const commitAndPublish = (
  todoId: TodoId,
  eventNumber: number,
  events: Readonly<ReadonlyArray<TodoEvent>>,
  successMessage: string
) =>
  pipe(
    commitTodoEvents(todoId, eventNumber, events),
    Effect.andThen(publishEvents(todoId, events)),
    Effect.andThen(Console.log(successMessage))
  );

const handleConditional = <E, R>(
  events: Readonly<ReadonlyArray<unknown>>,
  whenTrue: Readonly<Effect.Effect<void, E, R>>,
  whenFalse: Readonly<Effect.Effect<void, E, R>>
): Effect.Effect<void, E, R> => (events.length > 0 ? whenTrue : whenFalse);

const createTodoCommand = (userId: UserId, title: string) =>
  TodoAggregateRoot.commands.createTodo(userId, title);

const commitAndReturnId =
  (todoId: TodoId, eventNumber: number, title: string) =>
  (events: Readonly<ReadonlyArray<TodoEvent>>) =>
    pipe(
      commitAndPublish(todoId, eventNumber, events, `✓ Created TODO: ${title} (${todoId})`),
      Effect.as(todoId)
    );

const createTodo = (title: string) => {
  const todoId = `todo-${Date.now()}` as TodoId;
  const state = TodoAggregateRoot.new();

  return pipe(
    createTodoCommand(CURRENT_USER, title)(),
    Effect.flatMap(commitAndReturnId(todoId, state.nextEventNumber, title))
  );
};

const completeCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  TodoAggregateRoot.commands.complete(userId)(state);

const handleCompleteEvents =
  (todoId: TodoId, eventNumber: number) => (events: Readonly<ReadonlyArray<TodoEvent>>) =>
    handleConditional(
      events,
      commitAndPublish(todoId, eventNumber, events, `✓ Completed TODO: ${todoId}`),
      Console.log(`⚠ TODO ${todoId} is already completed`)
    );

const executeCompleteCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  pipe(completeCommand(userId, state));

const processCompleteState =
  (todoId: TodoId, userId: UserId) =>
  (
    state: Readonly<{
      readonly nextEventNumber: number;
      readonly data: Readonly<Option.Option<unknown>>;
    }>
  ) =>
    pipe(
      executeCompleteCommand(userId, state.data as Readonly<Option.Option<TodoState>>),
      Effect.flatMap(handleCompleteEvents(todoId, state.nextEventNumber))
    );

const loadTodoForComplete = (todoId: TodoId) => pipe(TodoAggregateRoot.load(todoId));

const completeTodo = (todoId: TodoId) =>
  pipe(loadTodoForComplete(todoId), Effect.flatMap(processCompleteState(todoId, CURRENT_USER)));

const uncompleteCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  TodoAggregateRoot.commands.uncomplete(userId)(state);

const handleUncompleteEvents =
  (todoId: TodoId, eventNumber: number) => (events: Readonly<ReadonlyArray<TodoEvent>>) =>
    handleConditional(
      events,
      commitAndPublish(todoId, eventNumber, events, `✓ Uncompleted TODO: ${todoId}`),
      Console.log(`⚠ TODO ${todoId} is already uncompleted`)
    );

const executeUncompleteCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  pipe(uncompleteCommand(userId, state));

const processUncompleteState =
  (todoId: TodoId, userId: UserId) =>
  (
    state: Readonly<{
      readonly nextEventNumber: number;
      readonly data: Readonly<Option.Option<unknown>>;
    }>
  ) =>
    pipe(
      executeUncompleteCommand(userId, state.data as Readonly<Option.Option<TodoState>>),
      Effect.flatMap(handleUncompleteEvents(todoId, state.nextEventNumber))
    );

const loadTodoForUncomplete = (todoId: TodoId) => pipe(TodoAggregateRoot.load(todoId));

const uncompleteTodo = (todoId: TodoId) =>
  pipe(loadTodoForUncomplete(todoId), Effect.flatMap(processUncompleteState(todoId, CURRENT_USER)));

const deleteCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  TodoAggregateRoot.commands.deleteTodo(userId)(state);

const handleDeleteEvents =
  (todoId: TodoId, eventNumber: number) => (events: Readonly<ReadonlyArray<TodoEvent>>) =>
    handleConditional(
      events,
      commitAndPublish(todoId, eventNumber, events, `✓ Deleted TODO: ${todoId}`),
      Console.log(`⚠ TODO ${todoId} is already deleted`)
    );

const executeDeleteCommand = (userId: UserId, state: Readonly<Option.Option<TodoState>>) =>
  pipe(deleteCommand(userId, state));

const processDeleteState =
  (todoId: TodoId, userId: UserId) =>
  (
    state: Readonly<{
      readonly nextEventNumber: number;
      readonly data: Readonly<Option.Option<unknown>>;
    }>
  ) =>
    pipe(
      executeDeleteCommand(userId, state.data as Readonly<Option.Option<TodoState>>),
      Effect.flatMap(handleDeleteEvents(todoId, state.nextEventNumber))
    );

const loadTodoForDelete = (todoId: TodoId) => pipe(TodoAggregateRoot.load(todoId));

const deleteTodo = (todoId: TodoId) =>
  pipe(loadTodoForDelete(todoId), Effect.flatMap(processDeleteState(todoId, CURRENT_USER)));

const formatAndLogTodo = (todoId: TodoId) => (todo: Readonly<TodoState>) =>
  pipe(
    Console.log(
      `  ${todo.completed ? '✓' : '○'} [${todoId}] ${todo.completed ? `\x1b[2m${todo.title}\x1b[0m` : todo.title}`
    ),
    Effect.as(Option.some(todo))
  );

const processProjectionData = (todoId: TodoId) => (data: Readonly<Option.Option<TodoState>>) =>
  pipe(
    data,
    Option.filter((t) => !t.deleted),
    Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: formatAndLogTodo(todoId),
    })
  );

const loadTodoProjectionForId = (todoId: TodoId) => pipe(loadTodoProjection(todoId));

const processTodoProjection =
  (todoId: TodoId) => (todoProjection: Readonly<Projection<TodoState>>) =>
    processProjectionData(todoId)(todoProjection.data);

const loadAndFormatTodo = (todoId: TodoId) =>
  pipe(loadTodoProjectionForId(todoId), Effect.flatMap(processTodoProjection(todoId)));

const forEachTodoItem = (todos: Readonly<ReadonlyArray<{ readonly todoId: TodoId }>>) =>
  Effect.forEach(todos, (item) => loadAndFormatTodo(item.todoId));

const logTodoListHeader = () => Console.log('\n📝 Your TODOs:\n');

const logTodoListFooter = () => Console.log('');

const formatTodoList = (todos: Readonly<ReadonlyArray<{ readonly todoId: TodoId }>>) =>
  pipe(
    logTodoListHeader(),
    Effect.andThen(forEachTodoItem(todos)),
    Effect.andThen(logTodoListFooter())
  );

const processListProjection = (projection: Readonly<Projection<TodoListProjection>>) => {
  const list = pipe(
    projection.data,
    Option.getOrElse(() => ({ todos: [] as const }))
  );

  return handleConditional(
    list.todos,
    formatTodoList(list.todos),
    Console.log('No TODOs yet. Create one with: bun run src/cli.ts create "My task"')
  );
};

const loadTodoListProjectionEffect = () => pipe(loadTodoListProjection());

const listTodos = () => pipe(loadTodoListProjectionEffect(), Effect.flatMap(processListProjection));

const showHelp = () =>
  Console.log(`
📝 TODO App - Event Sourcing Example

Usage:
  bun run src/cli.ts <command> [args]

Commands:
  create <title>      Create a new TODO
  complete <id>       Mark a TODO as completed
  uncomplete <id>     Mark a TODO as not completed
  delete <id>         Delete a TODO
  list                List all TODOs
  help                Show this help message

Examples:
  bun run src/cli.ts create "Buy milk"
  bun run src/cli.ts complete todo-1234567890
  bun run src/cli.ts list
`);

const logErrorMessage = (message: string) => Console.error(message);

const logUsage = (usage: string) => Console.log(usage);

const failWithError = (message: string) => Effect.fail(new Error(message));

const missingArgError = (message: string, usage: string) =>
  pipe(
    logErrorMessage(message),
    Effect.andThen(logUsage(usage)),
    Effect.andThen(failWithError(message))
  );

const runCommand = (
  args: ReadonlyArray<string>
): Effect.Effect<unknown, unknown, TodoAggregate | TodoListAggregate | EventBus> => {
  const command = args[0];

  switch (command) {
    case 'create': {
      const title = args[1];
      return title
        ? createTodo(title)
        : missingArgError('Error: Title is required', 'Usage: bun run src/cli.ts create <title>');
    }

    case 'complete': {
      const id = args[1];
      return id
        ? completeTodo(id as TodoId)
        : missingArgError('Error: TODO ID is required', 'Usage: bun run src/cli.ts complete <id>');
    }

    case 'uncomplete': {
      const id = args[1];
      return id
        ? uncompleteTodo(id as TodoId)
        : missingArgError(
            'Error: TODO ID is required',
            'Usage: bun run src/cli.ts uncomplete <id>'
          );
    }

    case 'delete': {
      const id = args[1];
      return id
        ? deleteTodo(id as TodoId)
        : missingArgError('Error: TODO ID is required', 'Usage: bun run src/cli.ts delete <id>');
    }

    case 'list':
      return listTodos();

    case 'help':
    default:
      return showHelp();
  }
};

const forkProcessManager = () => Effect.fork(startProcessManager());

const sleep100Millis = () => Effect.sleep('100 millis');

const sleep500Millis = () => Effect.sleep('500 millis');

const runWithProcessManager = (args: ReadonlyArray<string>) =>
  pipe(
    Effect.all([forkProcessManager(), sleep100Millis()]),
    Effect.andThen(runCommand(args)),
    Effect.asVoid,
    Effect.andThen(sleep500Millis())
  );

const scopeAndProvide = (args: ReadonlyArray<string>) =>
  pipe(Effect.scoped(runWithProcessManager(args)), Effect.provide(AppLive)) as Effect.Effect<
    void,
    unknown,
    never
  >;

const main = (args: ReadonlyArray<string>): Effect.Effect<void, unknown, never> =>
  scopeAndProvide(args);

const getProcessArgs = () => process.argv.slice(2);

pipe(getProcessArgs(), main, Effect.runPromise).catch(console.error);
