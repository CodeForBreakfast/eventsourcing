import { Effect, Layer, Stream, pipe, Ref, HashMap, Console, Scope } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { Client } from '@codeforbreakfast/eventsourcing-transport';
import {
  Protocol,
  ProtocolLive,
  type ProtocolEvent,
} from '@codeforbreakfast/eventsourcing-protocol';
import type { TodoEvent } from '../domain/todoEvents';
import type { TodoId } from '../domain/types';

const WS_URL = 'ws://localhost:8080';

interface TodoData {
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
}

type TodoMap = HashMap.HashMap<string, TodoData>;

interface AppState {
  readonly todos: TodoMap;
  readonly connected: boolean;
}

const updateConnectionStatus = (isConnected: boolean) =>
  Effect.sync(() => {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;

    if (isConnected) {
      statusEl.className = 'connection-status status-connected';
      statusEl.textContent = '✓ Connected to server';
      (document.getElementById('newTodoInput') as HTMLInputElement).disabled = false;
      (document.getElementById('addTodoBtn') as HTMLButtonElement).disabled = false;
    } else {
      statusEl.className = 'connection-status status-disconnected';
      statusEl.textContent = '✗ Disconnected from server';
      (document.getElementById('newTodoInput') as HTMLInputElement).disabled = true;
      (document.getElementById('addTodoBtn') as HTMLButtonElement).disabled = true;
    }
  });

const renderTodos = (todos: TodoMap) =>
  Effect.sync(() => {
    const listEl = document.getElementById('todoList');
    if (!listEl) return;

    if (HashMap.isEmpty(todos)) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No todos yet!</p>
          <p>Create one above to get started.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';

    const sortedTodos = Array.from(HashMap.toEntries(todos)).sort(([, a], [, b]) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return Number(a.completed) - Number(b.completed);
    });

    sortedTodos.forEach(([id, todo]) => {
      if (todo.deleted) return;

      const li = document.createElement('li');
      li.className = 'todo-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = todo.completed;
      checkbox.onclick = () => {
        const command = todo.completed ? 'UncompleteTodo' : 'CompleteTodo';
        (window as any).__toggleTodo(id, command);
      };

      const textDiv = document.createElement('div');
      textDiv.className = `todo-text ${todo.completed ? 'completed' : ''}`;
      textDiv.textContent = todo.title;

      const idSpan = document.createElement('span');
      idSpan.className = 'todo-id';
      idSpan.textContent = id;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'todo-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => {
        (window as any).__deleteTodo(id);
      };

      li.appendChild(checkbox);
      li.appendChild(textDiv);
      li.appendChild(idSpan);
      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });
  });

const sendCommand = (name: string, target: string, payload: unknown) =>
  pipe(
    Protocol,
    Effect.flatMap((protocol) =>
      protocol.sendWireCommand({
        id: crypto.randomUUID(),
        name,
        target,
        payload,
      })
    ),
    Effect.tap((result) =>
      result._tag === 'Failure'
        ? Console.error(`Command ${name} failed: ${result.error}`)
        : Console.log(`Command ${name} succeeded`)
    ),
    Effect.catchAll((error) =>
      pipe(
        Console.error(`Failed to send command ${name}:`, error),
        Effect.as({ _tag: 'Failure' as const, error })
      )
    )
  );

const addTodo = (stateRef: Ref.Ref<AppState>) =>
  Effect.gen(function* () {
    const inputEl = document.getElementById('newTodoInput') as HTMLInputElement;
    const title = inputEl.value.trim();
    if (!title) return;

    yield* sendCommand('CreateTodo', 'todo-list', { title });
    inputEl.value = '';
  });

const toggle = (id: string, command: string) => sendCommand(command, id, { id });

const remove = (id: string) => sendCommand('DeleteTodo', id, { id });

const applyEventToState =
  (event: ProtocolEvent) =>
  (state: AppState): AppState => {
    const todoId = event.streamId;
    const currentTodo = HashMap.get(state.todos, todoId);

    const data = event.data as TodoEvent;

    switch (event.eventType) {
      case 'TodoCreated': {
        const created = data as { readonly title: string };
        return {
          ...state,
          todos: HashMap.set(state.todos, todoId, {
            title: created.title,
            completed: false,
            deleted: false,
          }),
        };
      }
      case 'TodoTitleChanged': {
        const changed = data as { readonly title: string };
        return pipe(
          currentTodo,
          (opt) => (opt._tag === 'Some' ? opt.value : null),
          (todo) =>
            todo
              ? {
                  ...state,
                  todos: HashMap.set(state.todos, todoId, {
                    ...todo,
                    title: changed.title,
                  }),
                }
              : state
        );
      }
      case 'TodoCompleted':
        return pipe(
          currentTodo,
          (opt) => (opt._tag === 'Some' ? opt.value : null),
          (todo) =>
            todo
              ? {
                  ...state,
                  todos: HashMap.set(state.todos, todoId, {
                    ...todo,
                    completed: true,
                  }),
                }
              : state
        );
      case 'TodoUncompleted':
        return pipe(
          currentTodo,
          (opt) => (opt._tag === 'Some' ? opt.value : null),
          (todo) =>
            todo
              ? {
                  ...state,
                  todos: HashMap.set(state.todos, todoId, {
                    ...todo,
                    completed: false,
                  }),
                }
              : state
        );
      case 'TodoDeleted':
        return pipe(
          currentTodo,
          (opt) => (opt._tag === 'Some' ? opt.value : null),
          (todo) =>
            todo
              ? {
                  ...state,
                  todos: HashMap.set(state.todos, todoId, {
                    ...todo,
                    deleted: true,
                  }),
                }
              : state
        );
      default:
        return state;
    }
  };

const subscribeToStream = (streamId: string) =>
  pipe(
    Protocol,
    Effect.flatMap((protocol) => protocol.subscribe(streamId)),
    Effect.map((stream) => Stream.map(stream, (event) => event as unknown as ProtocolEvent))
  );

const handleEvent =
  (stateRef: Ref.Ref<AppState>) =>
  (event: ProtocolEvent): Effect.Effect<void> =>
    pipe(
      Ref.update(stateRef, applyEventToState(event)),
      Effect.andThen(Ref.get(stateRef)),
      Effect.flatMap((state) => renderTodos(state.todos))
    );

const handleTodoListEvent =
  (stateRef: Ref.Ref<AppState>) =>
  (event: ProtocolEvent): Effect.Effect<void> =>
    pipe(
      handleEvent(stateRef)(event),
      Effect.andThen(
        event.eventType === 'TodoCreated'
          ? pipe(
              subscribeToStream(event.streamId),
              Effect.flatMap((stream) => Stream.runForEach(stream, handleEvent(stateRef))),
              Effect.forkDaemon
            )
          : Effect.void
      )
    );

const setupGlobalHandlers = (stateRef: Ref.Ref<AppState>, scope: Scope.Scope) => {
  const connectorLayer = Layer.succeed(Client.Connector, WebSocketConnector);

  (window as any).__toggleTodo = (id: string, command: string) => {
    Effect.runPromise(
      pipe(
        toggle(id, command),
        Effect.provide(
          Layer.unwrapScoped(
            pipe(
              Client.Connector,
              Effect.flatMap((connector) => connector.connect(WS_URL)),
              Effect.map((transport) => ProtocolLive(transport)),
              Effect.provide(connectorLayer)
            )
          )
        ),
        Effect.scoped
      )
    );
  };

  (window as any).__deleteTodo = (id: string) => {
    Effect.runPromise(
      pipe(
        remove(id),
        Effect.provide(
          Layer.unwrapScoped(
            pipe(
              Client.Connector,
              Effect.flatMap((connector) => connector.connect(WS_URL)),
              Effect.map((transport) => ProtocolLive(transport)),
              Effect.provide(connectorLayer)
            )
          )
        ),
        Effect.scoped
      )
    );
  };

  (window as any).__addTodo = () => {
    Effect.runPromise(
      pipe(
        addTodo(stateRef),
        Effect.provide(
          Layer.unwrapScoped(
            pipe(
              Client.Connector,
              Effect.flatMap((connector) => connector.connect(WS_URL)),
              Effect.map((transport) => ProtocolLive(transport)),
              Effect.provide(connectorLayer)
            )
          )
        ),
        Effect.scoped
      )
    );
  };
};

const initializeUI = (stateRef: Ref.Ref<AppState>, scope: Scope.Scope) =>
  Effect.sync(() => {
    setupGlobalHandlers(stateRef, scope);

    const addBtn = document.getElementById('addTodoBtn');
    const inputEl = document.getElementById('newTodoInput') as HTMLInputElement;

    if (addBtn) {
      addBtn.onclick = () => (window as any).__addTodo();
    }

    if (inputEl) {
      inputEl.onkeypress = (e) => {
        if (e.key === 'Enter') (window as any).__addTodo();
      };
    }
  });

const program = Effect.gen(function* () {
  yield* Console.log('Starting application...');

  const stateRef = yield* Ref.make<AppState>({
    todos: HashMap.empty(),
    connected: false,
  });

  const scope = yield* Effect.scope;
  yield* initializeUI(stateRef, scope);
  yield* updateConnectionStatus(false);

  yield* Console.log('Connecting to WebSocket...');

  const connector = yield* Client.Connector;
  const transport = yield* connector.connect(WS_URL);

  yield* Console.log('Connected! Creating protocol layer...');

  const protocolLayer = ProtocolLive(transport);

  yield* Ref.update(stateRef, (state) => ({ ...state, connected: true }));
  yield* updateConnectionStatus(true);

  yield* Console.log('Subscribing to todo list...');

  const todoListStream = yield* pipe(
    subscribeToStream('todo-list-singleton'),
    Effect.provide(protocolLayer)
  );

  yield* Console.log('Running event stream...');

  yield* pipe(
    Stream.runForEach(todoListStream, handleTodoListEvent(stateRef)),
    Effect.provide(protocolLayer)
  );
});

const main = pipe(
  program,
  Effect.scoped,
  Effect.provide(Layer.succeed(Client.Connector, WebSocketConnector)),
  Effect.catchAll((error) =>
    pipe(
      Console.error('Application error:', error),
      Effect.andThen(updateConnectionStatus(false)),
      Effect.andThen(Effect.void)
    )
  )
);

Effect.runPromise(main);
