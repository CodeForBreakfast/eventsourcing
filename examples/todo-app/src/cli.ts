#!/usr/bin/env bun

import { Args, Command, HelpDoc } from '@effect/cli';
import { Effect, Layer, Console, Option, Chunk, pipe, Schema } from 'effect';
import { BunFileSystem, BunPath, BunRuntime, BunTerminal } from '@effect/platform-bun';
import { Projection } from '@codeforbreakfast/eventsourcing-projections';
import { make, makeFileSystemEventStore } from '@codeforbreakfast/eventsourcing-store-filesystem';
import {
  type EventRecord,
  provideCommandInitiator,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { TodoAggregate, TodoAggregateRoot, TodoState } from './domain/todoAggregate';
import { TodoListAggregate } from './domain/todoListAggregate';
import { EventBus, EventBusService, makeEventBus } from './infrastructure/eventBus';
import { startProcessManager } from './infrastructure/processManager';
import { loadTodoProjection } from './projections/todoProjection';
import { loadTodoListProjection, TodoListProjection } from './projections/todoListProjection';
import { TodoId, TodoIdSchema, UserId } from './domain/types';
import type { TodoEvent } from './domain/todoEvents';
import type { TodoListEvent } from './domain/todoListEvents';

const CURRENT_USER = 'user-1' as UserId;

const makeTodoEventStore = () => {
  const store = make<EventRecord<TodoEvent, UserId>>({ baseDir: './todo-data/todos' });
  return pipe(store, Effect.flatMap(makeFileSystemEventStore));
};

const makeTodoListEventStore = () => {
  const store = make<EventRecord<TodoListEvent, UserId>>({ baseDir: './todo-data/todo-lists' });
  return pipe(store, Effect.flatMap(makeFileSystemEventStore));
};

const publishEventsWithBus =
  (todoId: TodoId, events: ReadonlyArray<TodoEvent>) => (eventBus: Readonly<EventBusService>) =>
    pipe(events, Effect.forEach(eventBus.publish(todoId)));

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

const commitAndReturnId =
  (todoId: TodoId, eventNumber: number, title: string) =>
  (events: Readonly<ReadonlyArray<TodoEvent>>) =>
    pipe(
      commitAndPublish(todoId, eventNumber, events, `✓ Created TODO: ${title} (${todoId})`),
      Effect.as(todoId)
    );

const executeCreateTodo = (title: string) => TodoAggregateRoot.commands.createTodo(title)();

const createTodo = (title: string) => {
  const todoId = `todo-${Date.now()}` as TodoId;
  const state = TodoAggregateRoot.new();

  return pipe(
    title,
    executeCreateTodo,
    Effect.flatMap(commitAndReturnId(todoId, state.nextEventNumber, title))
  );
};

const processCommand = (
  todoState: Readonly<Option.Option<TodoState>>,
  command: (
    state: Readonly<Option.Option<TodoState>>
  ) => Effect.Effect<ReadonlyArray<TodoEvent>, Error>,
  todoId: TodoId,
  eventNumber: number,
  successMessage: string,
  noOpMessage: string
) =>
  pipe(
    todoState,
    command,
    Effect.flatMap((events) =>
      handleConditional(
        events,
        commitAndPublish(todoId, eventNumber, events, successMessage),
        Console.log(noOpMessage)
      )
    )
  );

const executeCommand = (
  todoId: TodoId,
  command: (
    state: Readonly<Option.Option<TodoState>>
  ) => Effect.Effect<ReadonlyArray<TodoEvent>, Error>,
  successMessage: string,
  noOpMessage: string
) =>
  pipe(
    todoId,
    TodoAggregateRoot.load,
    Effect.tap((state) =>
      Console.log(
        `Loaded state: nextEventNumber=${state.nextEventNumber}, hasData=${Option.isSome(state.data)}`
      )
    ),
    Effect.flatMap((state) =>
      processCommand(
        state.data,
        command,
        todoId,
        state.nextEventNumber,
        successMessage,
        noOpMessage
      )
    )
  );

const completeTodo = (todoId: TodoId) =>
  executeCommand(
    todoId,
    TodoAggregateRoot.commands.complete(),
    `✓ Completed TODO: ${todoId}`,
    `⚠ TODO ${todoId} is already completed`
  );

const uncompleteTodo = (todoId: TodoId) =>
  executeCommand(
    todoId,
    TodoAggregateRoot.commands.uncomplete(),
    `✓ Uncompleted TODO: ${todoId}`,
    `⚠ TODO ${todoId} is already uncompleted`
  );

const deleteTodo = (todoId: TodoId) =>
  executeCommand(
    todoId,
    TodoAggregateRoot.commands.deleteTodo(),
    `✓ Deleted TODO: ${todoId}`,
    `⚠ TODO ${todoId} is already deleted`
  );

const logTodo = (todoId: TodoId, todo: Readonly<TodoState>) =>
  Console.log(
    `  ${todo.completed ? '✓' : '○'} [${todoId}] ${todo.completed ? `\x1b[2m${todo.title}\x1b[0m` : todo.title}`
  );

const formatAndLogTodo = (todoId: TodoId) => (todo: Readonly<TodoState>) =>
  pipe(logTodo(todoId, todo), Effect.as(Option.some(todo)));

const filterDeleted = (t: TodoState) => !t.deleted;

const processProjectionData = (todoId: TodoId) => (data: Readonly<Option.Option<TodoState>>) =>
  pipe(
    data,
    Option.filter(filterDeleted),
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: formatAndLogTodo(todoId),
    })
  );

const processTodoProjection =
  (todoId: TodoId) => (todoProjection: Readonly<Projection<TodoState>>) =>
    pipe(todoProjection.data, processProjectionData(todoId));

const loadAndFormatTodo = (todoId: TodoId) =>
  pipe(todoId, loadTodoProjection, Effect.flatMap(processTodoProjection(todoId)));

const forEachTodoItem = (todos: Readonly<ReadonlyArray<{ readonly todoId: TodoId }>>) =>
  Effect.forEach(todos, (item) => loadAndFormatTodo(item.todoId));

const formatTodoList = (todos: Readonly<ReadonlyArray<{ readonly todoId: TodoId }>>) =>
  pipe(
    Effect.void,
    Effect.andThen(Console.log('\n📝 Your TODOs:\n')),
    Effect.andThen(forEachTodoItem(todos)),
    Effect.andThen(Console.log(''))
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

const listTodos = () => pipe(loadTodoListProjection(), Effect.flatMap(processListProjection));

const parseTodoId = (id: string): Effect.Effect<TodoId, HelpDoc.HelpDoc> =>
  pipe(
    id,
    Schema.decode(TodoIdSchema),
    Effect.mapError(() => HelpDoc.p(`Invalid TODO ID: ${id}`))
  );

const titleArg = Args.text({ name: 'title' }).pipe(
  Args.withDescription('The title of the TODO to create')
);

const todoIdArg = Args.text({ name: 'id' }).pipe(
  Args.withDescription('The ID of the TODO to operate on'),
  Args.mapEffect(parseTodoId)
);

const createCommand = Command.make('create', { title: titleArg }, ({ title }) => createTodo(title));

const completeCommand = Command.make('complete', { id: todoIdArg }, ({ id }) => completeTodo(id));

const uncompleteCommand = Command.make('uncomplete', { id: todoIdArg }, ({ id }) =>
  uncompleteTodo(id)
);

const deleteCommand = Command.make('delete', { id: todoIdArg }, ({ id }) => deleteTodo(id));

const listCommand = Command.make('list', {}, () => listTodos());

const todoCommand = Command.make('todo', {}).pipe(
  Command.withDescription('📝 TODO App - Event Sourcing Example'),
  Command.withSubcommands([
    createCommand,
    completeCommand,
    uncompleteCommand,
    deleteCommand,
    listCommand,
  ])
);

const forkProcessManager = () => Effect.fork(startProcessManager());

const withProcessManager = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  pipe(
    [forkProcessManager(), Effect.sleep('200 millis')],
    Effect.all,
    Effect.andThen(effect),
    Effect.andThen(Effect.sleep('1 second'))
  );

const platformLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer, BunTerminal.layer);

const appLayer = Layer.mergeAll(
  Layer.effect(EventBus, makeEventBus()),
  Layer.effect(TodoAggregate, makeTodoEventStore()),
  Layer.effect(TodoListAggregate, makeTodoListEventStore()),
  provideCommandInitiator(CURRENT_USER)
).pipe(Layer.provide(platformLayer));

const cli = Command.run(todoCommand, {
  name: 'TODO CLI',
  version: '0.1.2',
});

// eslint-disable-next-line effect/prefer-effect-platform -- CLI entry point requires direct process.argv access
pipe(
  cli(process.argv),
  withProcessManager,
  Effect.scoped,
  Effect.provide(appLayer),
  Effect.provide(platformLayer),
  BunRuntime.runMain
);
