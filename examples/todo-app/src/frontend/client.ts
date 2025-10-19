import { Effect, Layer, Stream, pipe, Ref, HashMap, Console, Match, Option } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { Client } from '@codeforbreakfast/eventsourcing-transport';
import {
  Protocol,
  ProtocolLive,
  type ProtocolEvent,
} from '@codeforbreakfast/eventsourcing-protocol';
import { isCommandFailure, type CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { TodoEvent } from '../domain/todoEvents';

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

interface WindowWithTodoHandlers extends Window {
  __toggleTodo: (id: string, command: string) => void;
  __deleteTodo: (id: string) => void;
  __addTodo: () => void;
}

const getElementByIdEffect = (id: string) => Effect.sync(() => document.getElementById(id));

const castToInputElement = (el: Readonly<HTMLElement> | null): Readonly<HTMLInputElement> | null =>
  el as Readonly<HTMLInputElement> | null;

const castToButtonElement = (
  el: Readonly<HTMLElement> | null
): Readonly<HTMLButtonElement> | null => el as Readonly<HTMLButtonElement> | null;

const getInputElementById = (id: string) =>
  pipe(id, getElementByIdEffect, Effect.map(castToInputElement));

const getButtonElementById = (id: string) =>
  pipe(id, getElementByIdEffect, Effect.map(castToButtonElement));

const setDisabledOnInput = (disabled: boolean, el: Readonly<HTMLInputElement | null>) =>
  Effect.sync(() =>
    el !== null ? ((el as HTMLInputElement).disabled = disabled as boolean) : undefined
  );

const setDisabledOnButton = (disabled: boolean, el: Readonly<HTMLButtonElement | null>) =>
  Effect.sync(() =>
    el !== null ? ((el as HTMLButtonElement).disabled = disabled as boolean) : undefined
  );

const setStatusElementProps = (isConnected: boolean, statusEl: Readonly<HTMLElement>) =>
  Effect.sync(() => {
    const className = isConnected
      ? 'connection-status status-connected'
      : 'connection-status status-disconnected';
    const textContent = isConnected ? '✓ Connected to server' : '✗ Disconnected from server';
    (statusEl as HTMLElement).className = className;
    (statusEl as HTMLElement).textContent = textContent;
    return undefined;
  });

const disableInputElementById = (disabled: boolean, id: string) =>
  pipe(
    id,
    getInputElementById,
    Effect.flatMap((el) => setDisabledOnInput(disabled, el))
  );

const disableButtonElementById = (disabled: boolean, id: string) =>
  pipe(
    id,
    getButtonElementById,
    Effect.flatMap((el) => setDisabledOnButton(disabled, el))
  );

const updateInputsForConnection = (isConnected: boolean) =>
  Effect.all([
    disableInputElementById(!isConnected, 'newTodoInput'),
    disableButtonElementById(!isConnected, 'addTodoBtn'),
  ]);

const updateStatusElement = (isConnected: boolean, statusEl: Readonly<HTMLElement | null>) =>
  statusEl === null
    ? Effect.void
    : pipe(
        setStatusElementProps(isConnected, statusEl),
        Effect.andThen(updateInputsForConnection(isConnected))
      );

const updateConnectionStatus = (isConnected: boolean) =>
  pipe(
    'status',
    getElementByIdEffect,
    Effect.flatMap((el) => updateStatusElement(isConnected, el))
  );

const createEmptyStateHtml = () => `
  <div class="empty-state">
    <p>No todos yet!</p>
    <p>Create one above to get started.</p>
  </div>
`;

const createCheckbox = (id: string, todo: TodoData) =>
  Effect.sync(() => {
    const checkbox = document.createElement('input');
    (checkbox as HTMLInputElement).type = 'checkbox';
    (checkbox as HTMLInputElement).className = 'todo-checkbox';
    (checkbox as HTMLInputElement).checked = todo.completed;
    (checkbox as HTMLInputElement).onclick = () => {
      const command = todo.completed ? 'UncompleteTodo' : 'CompleteTodo';
      (window as unknown as WindowWithTodoHandlers).__toggleTodo(id, command);
    };
    return checkbox;
  });

const createTextDiv = (todo: TodoData) =>
  Effect.sync(() => {
    const textDiv = document.createElement('div');
    (textDiv as HTMLDivElement).className = todo.completed ? 'todo-text completed' : 'todo-text';
    (textDiv as HTMLDivElement).textContent = todo.title;
    return textDiv;
  });

const createIdSpan = (id: string) =>
  Effect.sync(() => {
    const idSpan = document.createElement('span');
    (idSpan as HTMLSpanElement).className = 'todo-id';
    (idSpan as HTMLSpanElement).textContent = id;
    return idSpan;
  });

const createDeleteButton = (id: string) =>
  Effect.sync(() => {
    const deleteBtn = document.createElement('button');
    (deleteBtn as HTMLButtonElement).className = 'todo-delete';
    (deleteBtn as HTMLButtonElement).textContent = 'Delete';
    (deleteBtn as HTMLButtonElement).onclick = () => {
      (window as unknown as WindowWithTodoHandlers).__deleteTodo(id);
    };
    return deleteBtn;
  });

const assembleListItem = (
  checkbox: Readonly<HTMLInputElement>,
  textDiv: Readonly<HTMLDivElement>,
  idSpan: Readonly<HTMLSpanElement>,
  deleteBtn: Readonly<HTMLButtonElement>
) =>
  Effect.sync(() => {
    const li = document.createElement('li');
    (li as HTMLLIElement).className = 'todo-item';
    (li as HTMLLIElement).appendChild(checkbox as HTMLInputElement);
    (li as HTMLLIElement).appendChild(textDiv as HTMLDivElement);
    (li as HTMLLIElement).appendChild(idSpan as HTMLSpanElement);
    (li as HTMLLIElement).appendChild(deleteBtn as HTMLButtonElement);
    return li;
  });

const createAllTodoElements = (id: string, todo: TodoData) =>
  Effect.all({
    checkbox: createCheckbox(id, todo),
    textDiv: createTextDiv(todo),
    idSpan: createIdSpan(id),
    deleteBtn: createDeleteButton(id),
  });

const createTodoListItem = (id: string, todo: TodoData) =>
  pipe(
    [id, todo] as const,
    ([i, t]) => createAllTodoElements(i, t),
    Effect.flatMap(({ checkbox, textDiv, idSpan, deleteBtn }) =>
      assembleListItem(checkbox, textDiv, idSpan, deleteBtn)
    )
  );

const appendChild = (listEl: Readonly<HTMLElement>, li: Readonly<HTMLLIElement>) =>
  Effect.sync(() => {
    (listEl as HTMLElement).appendChild(li as HTMLLIElement);
    return undefined;
  });

const appendTodoToList = (listEl: Readonly<HTMLElement>, id: string, todo: TodoData) =>
  pipe(
    [id, todo] as const,
    ([i, t]) => createTodoListItem(i, t),
    Effect.flatMap((li) => appendChild(listEl, li))
  );

const sortTodoEntries = (entries: ReadonlyArray<readonly [string, TodoData]>) =>
  Array.from(entries).sort(([, a], [, b]) => {
    const deletedDiff = a.deleted !== b.deleted ? (a.deleted ? 1 : -1) : 0;
    return deletedDiff !== 0 ? deletedDiff : Number(a.completed) - Number(b.completed);
  });

const renderNonDeletedTodos = (
  listEl: Readonly<HTMLElement>,
  sortedTodos: ReadonlyArray<readonly [string, TodoData]>
) =>
  pipe(
    Effect.forEach(sortedTodos, ([id, todo]) =>
      todo.deleted ? Effect.void : appendTodoToList(listEl, id, todo)
    ),
    Effect.asVoid
  );

const setInnerHtml = (listEl: Readonly<HTMLElement>, html: string) =>
  Effect.sync(() => {
    (listEl as HTMLElement).innerHTML = html;
    return undefined;
  });

const renderEmptyState = (listEl: Readonly<HTMLElement>) =>
  setInnerHtml(listEl, createEmptyStateHtml());

const clearList = (listEl: Readonly<HTMLElement>) => setInnerHtml(listEl, '');

const sortEntriesFromTodoMap = (todos: TodoMap) => sortTodoEntries(HashMap.toEntries(todos));

const clearListAndSort = (listEl: Readonly<HTMLElement>, todos: TodoMap) =>
  pipe(listEl, clearList, Effect.as(sortEntriesFromTodoMap(todos)));

const renderSortedTodos = (listEl: Readonly<HTMLElement>, todos: TodoMap) =>
  pipe(
    [listEl, todos] as const,
    ([l, t]) => clearListAndSort(l, t),
    Effect.flatMap((sorted) => renderNonDeletedTodos(listEl, sorted))
  );

const renderTodosToElement = (listEl: Readonly<HTMLElement>, todos: TodoMap) =>
  pipe(
    todos,
    HashMap.isEmpty,
    Effect.if({
      onTrue: () => renderEmptyState(listEl),
      onFalse: () => renderSortedTodos(listEl, todos),
    })
  );

const renderTodosToNullableElement = (todos: TodoMap, listEl: Readonly<HTMLElement> | null) =>
  listEl === null ? Effect.void : renderTodosToElement(listEl, todos);

const renderTodos = (todos: TodoMap) =>
  pipe(
    'todoList',
    getElementByIdEffect,
    Effect.flatMap((el) => renderTodosToNullableElement(todos, el))
  );

const logCommandResult = (name: string, result: CommandResult) =>
  pipe(
    result,
    Match.value,
    Match.when(isCommandFailure, (failure) =>
      Console.error(`Command ${name} failed:`, failure.error)
    ),
    Match.orElse(() => Console.log(`Command ${name} succeeded`))
  );

const handleCommandError = (name: string, error: unknown) =>
  pipe(
    Console.error(`Failed to send command ${name}:`, error),
    Effect.as({ _tag: 'Failure' as const, error })
  );

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
    Effect.tap((result) => logCommandResult(name, result)),
    Effect.catchAll((error) => handleCommandError(name, error))
  );

const trimInputValue = (inputEl: Readonly<HTMLInputElement>) =>
  pipe(inputEl.value, (v: string) => v.trim(), Effect.succeed);

const clearInput = (inputEl: Readonly<HTMLInputElement>) =>
  Effect.sync(() => {
    (inputEl as HTMLInputElement).value = '';
    return undefined;
  });

const addTodoWithTitleAndClearInput = (title: string, inputEl: Readonly<HTMLInputElement>) =>
  pipe(
    ['CreateTodo', 'todo-list-singleton', { title }] as const,
    ([name, target, payload]) => sendCommand(name, target, payload),
    Effect.andThen(clearInput(inputEl))
  );

const addTodoWithInput = (inputEl: Readonly<HTMLInputElement>) =>
  pipe(
    inputEl,
    trimInputValue,
    Effect.flatMap((title) =>
      title === '' ? Effect.void : addTodoWithTitleAndClearInput(title, inputEl)
    )
  );

const addTodoFromNullableInput = (inputEl: Readonly<HTMLInputElement> | null) =>
  inputEl === null ? Effect.void : addTodoWithInput(inputEl);

const addTodo = () =>
  pipe('newTodoInput', getInputElementById, Effect.flatMap(addTodoFromNullableInput));

const toggle = (id: string, command: string) => sendCommand(command, id, { id });

const remove = (id: string) => sendCommand('DeleteTodo', id, { id });

const updateTodoInState = (
  state: AppState,
  todoId: string,
  updateFn: (todo: TodoData) => TodoData
) =>
  pipe(
    HashMap.get(state.todos, todoId),
    Option.match({
      onNone: () => state,
      onSome: (todo) => ({
        ...state,
        todos: HashMap.set(state.todos, todoId, updateFn(todo)),
      }),
    })
  );

const handleTodoCreatedEvent = (state: AppState, todoId: string, data: TodoEvent) =>
  data.type !== 'TodoCreated'
    ? state
    : {
        ...state,
        todos: HashMap.set(state.todos, todoId, {
          title: data.data.title,
          completed: false,
          deleted: false,
        }),
      };

const handleTodoTitleChangedEvent = (state: AppState, todoId: string, data: TodoEvent) =>
  data.type !== 'TodoTitleChanged'
    ? state
    : updateTodoInState(state, todoId, (todo) => ({ ...todo, title: data.data.title }));

const handleTodoCompletedEvent = (state: AppState, todoId: string) =>
  updateTodoInState(state, todoId, (todo) => ({ ...todo, completed: true }));

const handleTodoUncompletedEvent = (state: AppState, todoId: string) =>
  updateTodoInState(state, todoId, (todo) => ({ ...todo, completed: false }));

const handleTodoDeletedEvent = (state: AppState, todoId: string) =>
  updateTodoInState(state, todoId, (todo) => ({ ...todo, deleted: true }));

const applyEventToState =
  (event: ProtocolEvent) =>
  (state: AppState): AppState => {
    const todoId = event.streamId;
    const data = event.data as TodoEvent;

    return pipe(
      event.eventType,
      Match.value,
      Match.when('TodoCreated', () => handleTodoCreatedEvent(state, todoId, data)),
      Match.when('TodoTitleChanged', () => handleTodoTitleChangedEvent(state, todoId, data)),
      Match.when('TodoCompleted', () => handleTodoCompletedEvent(state, todoId)),
      Match.when('TodoUncompleted', () => handleTodoUncompletedEvent(state, todoId)),
      Match.when('TodoDeleted', () => handleTodoDeletedEvent(state, todoId)),
      Match.orElse(() => state)
    );
  };

const subscribeToStreamById = (streamId: string) =>
  pipe(
    Protocol,
    Effect.flatMap((protocol) => protocol.subscribe(streamId)),
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Stream events from protocol.subscribe are already validated by the Protocol layer
    Effect.map((stream) => Stream.map(stream, (event) => event as unknown as ProtocolEvent))
  );

const updateStateAndRender = (stateRef: Ref.Ref<AppState>, event: ProtocolEvent) =>
  pipe(
    Ref.update(stateRef, applyEventToState(event)),
    Effect.andThen(Ref.get(stateRef)),
    Effect.flatMap((state) => renderTodos(state.todos))
  );

const handleEvent =
  (stateRef: Ref.Ref<AppState>) =>
  (event: ProtocolEvent): Effect.Effect<void> =>
    updateStateAndRender(stateRef, event);

const subscribeToNewTodoStream = (stateRef: Ref.Ref<AppState>, streamId: string) =>
  pipe(
    streamId,
    subscribeToStreamById,
    Effect.flatMap((stream) => Stream.runForEach(stream, handleEvent(stateRef))),
    Effect.forkDaemon
  );

const processEventForTodoList = (stateRef: Ref.Ref<AppState>, event: ProtocolEvent) =>
  pipe(
    updateStateAndRender(stateRef, event),
    Effect.andThen(
      event.eventType === 'TodoCreated'
        ? subscribeToNewTodoStream(stateRef, event.streamId)
        : Effect.void
    )
  );

const handleTodoListEvent =
  (stateRef: Ref.Ref<AppState>) =>
  (event: ProtocolEvent): Effect.Effect<void, never, Protocol> =>
    processEventForTodoList(stateRef, event);

const setupGlobalHandlers = (protocolLayer: Layer.Layer<Protocol>) => {
  (window as unknown as WindowWithTodoHandlers).__toggleTodo = (id: string, command: string) => {
    // eslint-disable-next-line effect/no-runPromise -- Browser event handlers require runPromise for imperative execution
    Effect.runPromise(pipe(toggle(id, command), Effect.provide(protocolLayer)));
  };

  (window as unknown as WindowWithTodoHandlers).__deleteTodo = (id: string) => {
    // eslint-disable-next-line effect/no-runPromise -- Browser event handlers require runPromise for imperative execution
    Effect.runPromise(pipe(id, remove, Effect.provide(protocolLayer)));
  };

  (window as unknown as WindowWithTodoHandlers).__addTodo = () => {
    // eslint-disable-next-line effect/no-runPromise -- Browser event handlers require runPromise for imperative execution
    Effect.runPromise(pipe(undefined, addTodo, Effect.provide(protocolLayer)));
  };
};

const attachClickHandler = (addBtn: Readonly<HTMLElement> | null) =>
  Effect.sync(() =>
    addBtn === null
      ? undefined
      : ((addBtn as HTMLElement).onclick = () => {
          (window as unknown as WindowWithTodoHandlers).__addTodo();
        })
  );

const attachAddButtonClickHandler = () =>
  pipe('addTodoBtn', getElementByIdEffect, Effect.flatMap(attachClickHandler));

const attachKeyPressHandler = (inputEl: Readonly<HTMLElement> | null) =>
  Effect.sync(() =>
    inputEl === null
      ? undefined
      : ((inputEl as HTMLInputElement).onkeypress = (e) =>
          e.key === 'Enter'
            ? ((window as unknown as WindowWithTodoHandlers).__addTodo(), undefined)
            : undefined)
  );

const attachInputEnterKeyHandler = () =>
  pipe('newTodoInput', getInputElementById, Effect.flatMap(attachKeyPressHandler));

const setupUIEventHandlers = (protocolLayer: Layer.Layer<Protocol>) =>
  pipe(
    protocolLayer,
    (layer) => Effect.sync(() => setupGlobalHandlers(layer)),
    Effect.andThen(attachAddButtonClickHandler()),
    Effect.andThen(attachInputEnterKeyHandler())
  );

const initializeUI = setupUIEventHandlers;

const createInitialState = () =>
  Ref.make<AppState>({
    todos: HashMap.empty(),
    connected: false,
  });

const connectToWebSocketUrl = (url: string) =>
  pipe(
    Client.Connector,
    Effect.flatMap((connector) => connector.connect(url))
  );

const createProtocolLayerFromTransport = (transport: Client.Transport) =>
  pipe(transport, ProtocolLive, Layer.orDie);

const updateStateToConnected = (stateRef: Ref.Ref<AppState>) =>
  Ref.update(stateRef, (state) => ({ ...state, connected: true }));

const runTodoListStreamWithLayer = <E>(
  stateRef: Ref.Ref<AppState>,
  protocolLayer: Layer.Layer<Protocol>,
  todoListStream: Stream.Stream<ProtocolEvent, E, Protocol>
) =>
  pipe(
    todoListStream,
    Stream.runForEach(handleTodoListEvent(stateRef)),
    Effect.provide(protocolLayer)
  );

const subscribeTodoListAndRun = (
  stateRef: Ref.Ref<AppState>,
  protocolLayer: Layer.Layer<Protocol>
) =>
  pipe(
    'todo-list-singleton',
    subscribeToStreamById,
    Effect.provide(protocolLayer),
    Effect.flatMap((stream) => runTodoListStreamWithLayer(stateRef, protocolLayer, stream))
  );

const subscribeListForStateAndLayer = (
  stateRef: Ref.Ref<AppState>,
  protocolLayer: Layer.Layer<Protocol>
) => pipe([stateRef, protocolLayer] as const, ([s, p]) => subscribeTodoListAndRun(s, p));

const runEventStreamForStateAndLayer = (
  stateRef: Ref.Ref<AppState>,
  protocolLayer: Layer.Layer<Protocol>
) =>
  pipe(
    'Running event stream...',
    Console.log,
    Effect.andThen(subscribeListForStateAndLayer(stateRef, protocolLayer))
  );

const updateConnectionToTrue = () => pipe(true, updateConnectionStatus);

const logSubscribingMessage = () => pipe('Subscribing to todo list...', Console.log);

const setupProtocolAndSubscribe = (stateRef: Ref.Ref<AppState>, transport: Client.Transport) =>
  pipe(
    'Connected! Creating protocol layer...',
    Console.log,
    Effect.as(createProtocolLayerFromTransport(transport)),
    Effect.tap(initializeUI),
    Effect.tap(() => updateStateToConnected(stateRef)),
    Effect.tap(updateConnectionToTrue),
    Effect.tap(logSubscribingMessage),
    Effect.flatMap((protocolLayer) => runEventStreamForStateAndLayer(stateRef, protocolLayer))
  );

const connectAndSetupProtocol = (stateRef: Ref.Ref<AppState>) =>
  pipe(
    WS_URL,
    connectToWebSocketUrl,
    Effect.flatMap((transport) => setupProtocolAndSubscribe(stateRef, transport))
  );

const makeInitialState = () => pipe(undefined, createInitialState);

const updateConnectionToFalse = () => pipe(false, updateConnectionStatus);

const logConnectingMessage = () => pipe('Connecting to WebSocket...', Console.log);

const runApplication = () =>
  pipe(
    'Starting application...',
    Console.log,
    Effect.andThen(makeInitialState()),
    Effect.tap(updateConnectionToFalse),
    Effect.tap(logConnectingMessage),
    Effect.flatMap(connectAndSetupProtocol)
  );

const handleApplicationError = (error: unknown) =>
  pipe(
    Console.error('Application error:', error),
    Effect.andThen(updateConnectionStatus(false)),
    Effect.asVoid
  );

// eslint-disable-next-line effect/no-runPromise -- Application entry point requires runPromise
Effect.runPromise(
  pipe(
    runApplication(),
    Effect.scoped,
    Effect.provide(Layer.succeed(Client.Connector, WebSocketConnector)),
    Effect.catchAll(handleApplicationError)
  )
);
