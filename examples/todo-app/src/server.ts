#!/usr/bin/env bun

import {
  Effect,
  Layer,
  Console,
  Stream,
  pipe,
  Chunk,
  Schema,
  Option,
  Either,
  Match,
  Context,
} from 'effect';
import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import {
  type EventRecord,
  provideCommandInitiator,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { type EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { make, makeFileSystemEventStore } from '@codeforbreakfast/eventsourcing-store-filesystem';
import { WebSocketAcceptor } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { ServerProtocol, ServerProtocolLive } from '@codeforbreakfast/eventsourcing-protocol';
import { TodoAggregate, TodoAggregateRoot, type TodoState } from './domain/todoAggregate';
import { TodoListAggregate } from './domain/todoListAggregate';
import { EventBus, EventBusService, makeEventBus } from './infrastructure/eventBus';
import { startProcessManager } from './infrastructure/processManager';
import { TodoId, TodoIdSchema, UserId } from './domain/types';
import type { TodoEvent } from './domain/todoEvents';
import type { TodoListEvent } from './domain/todoListEvents';

const SYSTEM_USER = 'system' as UserId;
const WS_PORT = 8080;
const HTTP_PORT = 3000;
const HOST = '0.0.0.0';

const makeTodoEventStore = () => {
  const store = make<EventRecord<TodoEvent, UserId>>({ baseDir: './todo-data/todos' });
  return pipe(store, Effect.flatMap(makeFileSystemEventStore));
};

const makeTodoListEventStore = () => {
  const store = make<EventRecord<TodoListEvent, UserId>>({ baseDir: './todo-data/todo-lists' });
  return pipe(store, Effect.flatMap(makeFileSystemEventStore));
};

const commitAndPublishEvents =
  (eventBus: Readonly<EventBusService>) =>
  (todoId: TodoId) =>
  (eventNumber: number) =>
  (events: readonly TodoEvent[]) => {
    const publishToTodo = eventBus.publish(todoId);
    const commitData = {
      id: todoId,
      eventNumber,
      events: Chunk.fromIterable(events),
    };

    return pipe(
      commitData,
      TodoAggregateRoot.commit,
      Effect.andThen(Effect.forEach(events, publishToTodo)),
      Effect.as(events.length > 0)
    );
  };

const createTodoFromCommand =
  (eventBus: Readonly<EventBusService>) => (todoId: TodoId, title: string) => {
    const state = TodoAggregateRoot.new();
    const commitEvents = commitAndPublishEvents(eventBus);
    const commitForTodo = commitEvents(todoId);
    const commitFn = commitForTodo(state.nextEventNumber);
    const createCommand = TodoAggregateRoot.commands.createTodo(title);

    return pipe(title, createCommand, Effect.flatMap(commitFn));
  };

const applyCommandAndCommit =
  (eventBus: Readonly<EventBusService>) =>
  (todoId: TodoId) =>
  (eventNumber: number) =>
  (
    command: (
      state: Readonly<Option.Option<TodoState>>
    ) => Effect.Effect<readonly TodoEvent[], Error, never>
  ) => {
    const commitEvents = commitAndPublishEvents(eventBus);
    const commitForTodo = commitEvents(todoId);
    const commitFn = commitForTodo(eventNumber);
    return (state: Readonly<Option.Option<TodoState>>) =>
      pipe(state, command, Effect.flatMap(commitFn));
  };

const processTodoCommand =
  (eventBus: Readonly<EventBusService>) =>
  (
    todoId: TodoId,
    command: (
      state: Readonly<Option.Option<TodoState>>
    ) => Effect.Effect<readonly TodoEvent[], Error, never>
  ) => {
    const applyStateCommand = (state: {
      readonly data: Option.Option<TodoState>;
      readonly nextEventNumber: number;
    }) => {
      const applyCommand = applyCommandAndCommit(eventBus);
      const applyForTodo = applyCommand(todoId);
      const applyAtEventNumber = applyForTodo(state.nextEventNumber);
      const applyFn = applyAtEventNumber(command);
      return pipe(state.data, applyFn);
    };

    return pipe(todoId, TodoAggregateRoot.load, Effect.flatMap(applyStateCommand));
  };

const parseCommandPayload =
  <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  (payload: unknown) =>
    pipe(
      payload,
      Schema.decodeUnknown(schema),
      Effect.mapError((error) => new Error(`Invalid command payload: ${error}`))
    );

const CreateTodoPayloadSchema = Schema.Struct({
  title: Schema.String,
});

const TodoActionPayloadSchema = Schema.Struct({
  id: TodoIdSchema,
});

const createSuccessResult = (streamId: EventStreamId, eventNumber: number) => ({
  _tag: 'Success' as const,
  position: {
    streamId,
    eventNumber,
  },
});

const createExecutionError = (message: string) => ({
  _tag: 'ExecutionError' as const,
  commandId: crypto.randomUUID(),
  commandName: 'TodoCommand',
  message,
});

const createErrorResult = (error: Readonly<Error>) => ({
  _tag: 'Failure' as const,
  error: createExecutionError(String(error)),
});

const createTodoCommandParser =
  (eventBus: Readonly<EventBusService>) =>
  (wireCommand: { readonly name: string; readonly payload: unknown; readonly target: string }) => {
    const executeCreateTodo = (payload: { readonly title: string }) => {
      const todoId = `todo-${Date.now()}-${Math.random()}` as TodoId;
      const createCommand = createTodoFromCommand(eventBus);
      return pipe(
        createCommand(todoId, payload.title),
        Effect.map((success) => ({ success, todoId }) as const)
      );
    };

    return pipe(
      wireCommand.payload,
      parseCommandPayload(CreateTodoPayloadSchema),
      Effect.flatMap(executeCreateTodo)
    );
  };

const completeTodoCommandParser =
  (eventBus: Readonly<EventBusService>) => (wireCommand: { readonly payload: unknown }) => {
    const executeComplete = (payload: { readonly id: TodoId }) => {
      const completeCommand = TodoAggregateRoot.commands.complete();
      const processCommand = processTodoCommand(eventBus);
      return pipe(
        processCommand(payload.id, completeCommand),
        Effect.map((success) => ({ success, todoId: payload.id }) as const)
      );
    };

    return pipe(
      wireCommand.payload,
      parseCommandPayload(TodoActionPayloadSchema),
      Effect.flatMap(executeComplete)
    );
  };

const uncompleteTodoCommandParser =
  (eventBus: Readonly<EventBusService>) => (wireCommand: { readonly payload: unknown }) => {
    const executeUncomplete = (payload: { readonly id: TodoId }) => {
      const uncompleteCommand = TodoAggregateRoot.commands.uncomplete();
      const processCommand = processTodoCommand(eventBus);
      return pipe(
        processCommand(payload.id, uncompleteCommand),
        Effect.map((success) => ({ success, todoId: payload.id }) as const)
      );
    };

    return pipe(
      wireCommand.payload,
      parseCommandPayload(TodoActionPayloadSchema),
      Effect.flatMap(executeUncomplete)
    );
  };

const deleteTodoCommandParser =
  (eventBus: Readonly<EventBusService>) => (wireCommand: { readonly payload: unknown }) => {
    const executeDelete = (payload: { readonly id: TodoId }) => {
      const deleteCommand = TodoAggregateRoot.commands.deleteTodo();
      const processCommand = processTodoCommand(eventBus);
      return pipe(
        processCommand(payload.id, deleteCommand),
        Effect.map((success) => ({ success, todoId: payload.id }) as const)
      );
    };

    return pipe(
      wireCommand.payload,
      parseCommandPayload(TodoActionPayloadSchema),
      Effect.flatMap(executeDelete)
    );
  };

const routeCommand =
  (eventBus: Readonly<EventBusService>) =>
  (wireCommand: { readonly name: string; readonly payload: unknown; readonly target: string }) => {
    const createParser = createTodoCommandParser(eventBus);
    const completeParser = completeTodoCommandParser(eventBus);
    const uncompleteParser = uncompleteTodoCommandParser(eventBus);
    const deleteParser = deleteTodoCommandParser(eventBus);

    const executeCreateTodo = () => createParser(wireCommand);
    const executeCompleteTodo = () => completeParser(wireCommand);
    const executeUncompleteTodo = () => uncompleteParser(wireCommand);
    const executeDeleteTodo = () => deleteParser(wireCommand);
    const failUnknownCommand = () => Effect.fail(new Error(`Unknown command: ${wireCommand.name}`));

    return pipe(
      wireCommand.name,
      Match.value,
      Match.when('CreateTodo', executeCreateTodo),
      Match.when('CompleteTodo', executeCompleteTodo),
      Match.when('UncompleteTodo', executeUncompleteTodo),
      Match.when('DeleteTodo', executeDeleteTodo),
      Match.orElse(failUnknownCommand)
    );
  };

const ErrorSchema = Schema.instanceOf(Error);

type ProtocolService = Context.Tag.Service<typeof ServerProtocol>;

const matchResultAndSendToClient = (
  protocol: Readonly<ProtocolService>,
  wireCommand: Readonly<{
    readonly id: string;
    readonly target: string;
  }>,
  result: Readonly<Either.Either<{ readonly success: boolean; readonly todoId: TodoId }, Error>>
) => {
  const handleErrorResult = (error: Readonly<Error>) => {
    const sendErrorResult = (errorResult: Readonly<ReturnType<typeof createErrorResult>>) =>
      protocol.sendResult(wireCommand.id, errorResult as never);

    const sendFallbackError = () =>
      protocol.sendResult(wireCommand.id, createErrorResult(new Error(String(error))) as never);

    return pipe(
      error,
      Schema.decodeUnknown(ErrorSchema),
      Effect.map(createErrorResult),
      Effect.flatMap(sendErrorResult),
      Effect.catchAll(sendFallbackError)
    );
  };

  const handleSuccessResult = () =>
    protocol.sendResult(
      wireCommand.id,
      createSuccessResult(wireCommand.target as EventStreamId, 0) as never
    );

  return pipe(
    result,
    Either.match({
      onLeft: handleErrorResult,
      onRight: handleSuccessResult,
    })
  );
};

const createResultSender =
  (
    protocol: Readonly<ProtocolService>,
    wireCommand: Readonly<{
      readonly id: string;
      readonly target: string;
    }>
  ) =>
  (
    result: Readonly<Either.Either<{ readonly success: boolean; readonly todoId: TodoId }, Error>>
  ) =>
    matchResultAndSendToClient(protocol, wireCommand, result);

const sendResult = (
  protocol: ProtocolService,
  wireCommand: {
    readonly id: string;
    readonly target: string;
  },
  result: Readonly<Either.Either<{ readonly success: boolean; readonly todoId: TodoId }, Error>>
) => pipe(result, createResultSender(protocol, wireCommand));

const handleErrorMessage = (error: unknown) =>
  pipe(
    error,
    Schema.decodeUnknown(ErrorSchema),
    Effect.map((e) => e.message),
    Effect.catchAll(() => Effect.succeed(String(error))),
    Effect.flatMap((msg) => Console.error(`Command failed: ${msg}`))
  );

const executeCommand = (
  eventBus: Readonly<EventBusService>,
  protocol: ProtocolService,
  wireCommand: {
    readonly id: string;
    readonly name: string;
    readonly payload: unknown;
    readonly target: string;
  }
) =>
  pipe(
    wireCommand,
    routeCommand(eventBus),
    Effect.either,
    Effect.flatMap((result) => sendResult(protocol, wireCommand, result))
  );

const createLogMessage = (wireCommand: { readonly name: string; readonly target: string }) =>
  `Received command: ${wireCommand.name} for ${wireCommand.target}`;

const createReceivedCommandLog = (wireCommand: {
  readonly name: string;
  readonly target: string;
}) => Console.log(createLogMessage(wireCommand));

const processWireCommand = (
  eventBus: Readonly<EventBusService>,
  protocol: ProtocolService,
  wireCommand: Readonly<{
    readonly id: string;
    readonly name: string;
    readonly payload: unknown;
    readonly target: string;
  }>
) => {
  const logMessage = createReceivedCommandLog(wireCommand);
  const executeCmd = executeCommand(eventBus, protocol, wireCommand);

  return pipe(logMessage, Effect.andThen(executeCmd), Effect.catchAll(handleErrorMessage));
};

const processWireCommandForProtocol =
  (eventBus: Readonly<EventBusService>, protocol: ProtocolService) =>
  (wireCommand: {
    readonly id: string;
    readonly name: string;
    readonly payload: unknown;
    readonly target: string;
  }) =>
    processWireCommand(eventBus, protocol, wireCommand);

const runCommandStream = (eventBus: Readonly<EventBusService>) => (protocol: ProtocolService) =>
  pipe(
    protocol.onWireCommand,
    Stream.runForEach(processWireCommandForProtocol(eventBus, protocol)),
    Effect.forkScoped
  );

const handleCommandDispatch = (eventBus: Readonly<EventBusService>) =>
  pipe(ServerProtocol, Effect.flatMap(runCommandStream(eventBus)));

const forkProcessManagerEffect = startProcessManager();

const forkProcessManager = pipe(forkProcessManagerEffect, Effect.forkScoped);

const startHttpServer = Effect.sync(() => {
  Bun.serve({
    port: HTTP_PORT,
    hostname: HOST,
    async fetch(req) {
      const url = new URL(req.url);
      const filePath = url.pathname === '/' ? '/index.html' : url.pathname;

      // eslint-disable-next-line effect/prefer-effect-platform -- Bun's built-in file serving is more efficient for this simple static file server
      const file = Bun.file(`./public${filePath}`);
      const exists = await file.exists();

      return exists ? new Response(file) : new Response('Not Found', { status: 404 });
    },
  });

  return void 0;
});

const startupMessage = `
🚀 Servers running:
   - HTTP:      http://${HOST}:${HTTP_PORT}
   - WebSocket: ws://${HOST}:${WS_PORT}

Try the frontend:
  Open http://localhost:${HTTP_PORT} in your browser
`;

const logStartupMessage = Console.log(startupMessage);

const provideLayerToDispatch =
  (eventBus: Readonly<EventBusService>) =>
  <E, R>(serverProtocolLayer: Layer.Layer<ServerProtocol, E, R>) => {
    const dispatchEffect = handleCommandDispatch(eventBus);

    return pipe(dispatchEffect, Effect.provide(serverProtocolLayer));
  };

const startAllServices =
  (eventBus: Readonly<EventBusService>) =>
  <T>(serverTransport: T) => {
    const serverProtocolLayer = ServerProtocolLive(serverTransport as never);
    const provideLayer = provideLayerToDispatch(eventBus);
    const dispatchWithLayer = provideLayer(serverProtocolLayer);

    return pipe(
      [forkProcessManager, startHttpServer, logStartupMessage, dispatchWithLayer] as const,
      Effect.all,
      Effect.asVoid,
      Effect.andThen(Effect.never)
    );
  };

const startAcceptor = <
  T extends { readonly start: () => Effect.Effect<unknown, unknown, unknown> },
>(
  eventBus: Readonly<EventBusService>,
  acceptor: T
) => pipe(acceptor.start(), Effect.flatMap(startAllServices(eventBus)));

BunRuntime.runMain(
  pipe(
    [WebSocketAcceptor.make({ port: WS_PORT, host: HOST }), EventBus] as const,
    Effect.all,
    Effect.flatMap(([acceptor, eventBus]) => startAcceptor(eventBus, acceptor)),
    Effect.scoped,
    Effect.provide(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.effect(EventBus, makeEventBus()),
          Layer.effect(TodoAggregate, makeTodoEventStore()),
          Layer.effect(TodoListAggregate, makeTodoListEventStore()),
          provideCommandInitiator(SYSTEM_USER)
        ),
        Layer.mergeAll(BunFileSystem.layer, BunPath.layer)
      )
    )
  ) as never
);
