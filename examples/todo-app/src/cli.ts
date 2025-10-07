#!/usr/bin/env bun

import { Effect, Layer, Console, Option, Chunk, pipe } from 'effect';
import {
  makeInMemoryEventStore,
  InMemoryStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import { TodoAggregate, TodoAggregateRoot } from './domain/todoAggregate';
import { TodoListAggregate } from './domain/todoListAggregate';
import { EventBus, makeEventBus } from './infrastructure/eventBus';
import { startProcessManager } from './infrastructure/processManager';
import { loadTodoProjection } from './projections/todoProjection';
import { loadTodoListProjection } from './projections/todoListProjection';
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

const publishEvents = (todoId: TodoId, events: ReadonlyArray<TodoEvent>) =>
  pipe(
    EventBus,
    Effect.flatMap((eventBus) =>
      pipe(
        events,
        Effect.forEach((event) => eventBus.publish(todoId, event))
      )
    )
  );

const commitAndPublish = (
  todoId: TodoId,
  eventNumber: number,
  events: ReadonlyArray<TodoEvent>,
  successMessage: string
) =>
  pipe(
    TodoAggregateRoot.commit({
      id: todoId,
      eventNumber,
      events: Chunk.fromIterable(events),
    }),
    Effect.flatMap(() => publishEvents(todoId, events)),
    Effect.flatMap(() => Console.log(successMessage))
  );

const handleConditional = <E, R>(
  events: ReadonlyArray<unknown>,
  whenTrue: Effect.Effect<void, E, R>,
  whenFalse: Effect.Effect<void, E, R>
): Effect.Effect<void, E, R> => (events.length > 0 ? whenTrue : whenFalse);

const createTodo = (title: string) => {
  const todoId = `todo-${Date.now()}` as TodoId;
  const state = TodoAggregateRoot.new();

  return pipe(
    TodoAggregateRoot.commands.createTodo(CURRENT_USER, title)(),
    Effect.flatMap((events) =>
      pipe(
        commitAndPublish(
          todoId,
          state.nextEventNumber,
          events,
          `✓ Created TODO: ${title} (${todoId})`
        ),
        Effect.as(todoId)
      )
    )
  );
};

const completeTodo = (todoId: TodoId) =>
  pipe(
    TodoAggregateRoot.load(todoId),
    Effect.flatMap((state) =>
      pipe(
        TodoAggregateRoot.commands.complete(CURRENT_USER)(
          state.data as Readonly<Option.Option<import('./domain/todoAggregate').TodoState>>
        ),
        Effect.flatMap((events: ReadonlyArray<TodoEvent>) =>
          handleConditional(
            events,
            commitAndPublish(todoId, state.nextEventNumber, events, `✓ Completed TODO: ${todoId}`),
            Console.log(`⚠ TODO ${todoId} is already completed`)
          )
        )
      )
    )
  );

const uncompleteTodo = (todoId: TodoId) =>
  pipe(
    TodoAggregateRoot.load(todoId),
    Effect.flatMap((state) =>
      pipe(
        TodoAggregateRoot.commands.uncomplete(CURRENT_USER)(
          state.data as Readonly<Option.Option<import('./domain/todoAggregate').TodoState>>
        ),
        Effect.flatMap((events: ReadonlyArray<TodoEvent>) =>
          handleConditional(
            events,
            commitAndPublish(
              todoId,
              state.nextEventNumber,
              events,
              `✓ Uncompleted TODO: ${todoId}`
            ),
            Console.log(`⚠ TODO ${todoId} is already uncompleted`)
          )
        )
      )
    )
  );

const deleteTodo = (todoId: TodoId) =>
  pipe(
    TodoAggregateRoot.load(todoId),
    Effect.flatMap((state) =>
      pipe(
        TodoAggregateRoot.commands.deleteTodo(CURRENT_USER)(
          state.data as Readonly<Option.Option<import('./domain/todoAggregate').TodoState>>
        ),
        Effect.flatMap((events: ReadonlyArray<TodoEvent>) =>
          handleConditional(
            events,
            commitAndPublish(todoId, state.nextEventNumber, events, `✓ Deleted TODO: ${todoId}`),
            Console.log(`⚠ TODO ${todoId} is already deleted`)
          )
        )
      )
    )
  );

const loadAndFormatTodo = (todoId: TodoId) =>
  pipe(
    loadTodoProjection(todoId),
    Effect.flatMap((todoProjection) =>
      pipe(
        todoProjection.data,
        Option.filter((t) => !t.deleted),
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (todo) => {
            const status = todo.completed ? '✓' : '○';
            const title = todo.completed ? `\x1b[2m${todo.title}\x1b[0m` : todo.title;
            return pipe(
              Console.log(`  ${status} [${todoId}] ${title}`),
              Effect.as(Option.some(todo))
            );
          },
        })
      )
    )
  );

const listTodos = () =>
  pipe(
    loadTodoListProjection(),
    Effect.flatMap((projection) => {
      const list = pipe(
        projection.data,
        Option.getOrElse(() => ({ todos: [] as const }))
      );

      return handleConditional(
        list.todos,
        pipe(
          Console.log('\n📝 Your TODOs:\n'),
          Effect.flatMap(() =>
            pipe(
              list.todos,
              Effect.forEach((item) => loadAndFormatTodo(item.todoId))
            )
          ),
          Effect.flatMap(() => Console.log(''))
        ),
        Console.log('No TODOs yet. Create one with: bun run src/cli.ts create "My task"')
      );
    })
  );

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

const missingArgError = (message: string, usage: string) =>
  pipe(
    Console.error(message),
    Effect.flatMap(() => Console.log(usage)),
    Effect.flatMap(() => Effect.fail(new Error(message)))
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

const main = (args: ReadonlyArray<string>) =>
  pipe(
    Effect.scoped(
      pipe(
        Effect.all([Effect.fork(startProcessManager()), Effect.sleep('100 millis')]),
        Effect.flatMap(() => runCommand(args)),
        Effect.asVoid,
        Effect.flatMap(() => Effect.sleep('500 millis'))
      )
    ),
    Effect.provide(AppLive)
  );

Effect.runPromise(
  pipe(
    Effect.sync(() => process.argv.slice(2)),
    Effect.flatMap(main)
  )
).catch(console.error);
