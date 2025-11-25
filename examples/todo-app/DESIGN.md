# TODO App - Event Sourcing Example

Comprehensive example demonstrating event sourcing patterns using the `@codeforbreakfast/eventsourcing` packages.

## Architecture Overview

This example demonstrates:

- **Multiple Aggregate Types** (TodoAggregate, TodoListAggregate)
- **Process Managers** for aggregate coordination
- **Projections** for read models
- **Event-driven Architecture** with Effect PubSub
- **Type Safety** throughout the domain

## Domain Model

### Aggregates

#### 1. TodoAggregate

One instance per TODO item. Manages the lifecycle and state of individual TODOs.

**Identity:**

```typescript
import { Schema } from 'effect';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;
```

**Events:**

```typescript
import { Schema } from 'effect';
import { eventSchema } from '@codeforbreakfast/eventsourcing-aggregates';

// Event 1: Todo Created
const TodoCreated = eventSchema(Schema.Literal('TodoCreated'), {
  title: Schema.String,
  createdAt: Schema.ValidDateFromSelf,
});
type TodoCreated = typeof TodoCreated.Type;

// Event 2: Todo Title Changed
const TodoTitleChanged = eventSchema(Schema.Literal('TodoTitleChanged'), {
  title: Schema.String,
  changedAt: Schema.ValidDateFromSelf,
});
type TodoTitleChanged = typeof TodoTitleChanged.Type;

// Event 3: Todo Completed
const TodoCompleted = eventSchema(Schema.Literal('TodoCompleted'), {
  completedAt: Schema.ValidDateFromSelf,
});
type TodoCompleted = typeof TodoCompleted.Type;

// Event 4: Todo Uncompleted
const TodoUncompleted = eventSchema(Schema.Literal('TodoUncompleted'), {
  uncompletedAt: Schema.ValidDateFromSelf,
});
type TodoUncompleted = typeof TodoUncompleted.Type;

// Event 5: Todo Deleted
const TodoDeleted = eventSchema(Schema.Literal('TodoDeleted'), {
  deletedAt: Schema.ValidDateFromSelf,
});
type TodoDeleted = typeof TodoDeleted.Type;

// Union of all Todo events
const TodoEvent = Schema.Union(
  TodoCreated,
  TodoTitleChanged,
  TodoCompleted,
  TodoUncompleted,
  TodoDeleted
);
type TodoEvent = typeof TodoEvent.Type;
```

**State:**

```typescript
import { Option } from 'effect';

interface TodoState {
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deleted: boolean;
}

type TodoStateOption = Option.Option<TodoState>;
```

**Commands:**

```typescript
import { Effect, Option, pipe, Schema } from 'effect';

const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

interface TodoState {
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
}

type TodoCreated = {
  type: 'TodoCreated';
  metadata: { occurredAt: Date; originator: UserId };
  data: { title: string; createdAt: Date };
};
type TodoTitleChanged = {
  type: 'TodoTitleChanged';
  metadata: { occurredAt: Date; originator: UserId };
  data: { title: string; changedAt: Date };
};
type TodoCompleted = {
  type: 'TodoCompleted';
  metadata: { occurredAt: Date; originator: UserId };
  data: { completedAt: Date };
};
type TodoUncompleted = {
  type: 'TodoUncompleted';
  metadata: { occurredAt: Date; originator: UserId };
  data: { uncompletedAt: Date };
};
type TodoDeleted = {
  type: 'TodoDeleted';
  metadata: { occurredAt: Date; originator: UserId };
  data: { deletedAt: Date };
};

const createTodo = (userId: UserId, title: string) => () =>
  Effect.succeed([
    {
      type: 'TodoCreated' as const,
      metadata: { occurredAt: new Date(), originator: userId },
      data: { title, createdAt: new Date() },
    } satisfies TodoCreated,
  ]);

const changeTitle =
  (userId: UserId, title: string) => (state: Readonly<Option.Option<TodoState>>) =>
    pipe(
      state,
      Option.match({
        onNone: () => Effect.fail(new Error('Cannot change title of non-existent TODO')),
        onSome: (current) =>
          current.deleted
            ? Effect.fail(new Error('Cannot change title of deleted TODO'))
            : Effect.succeed([
                {
                  type: 'TodoTitleChanged' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { title, changedAt: new Date() },
                } satisfies TodoTitleChanged,
              ]),
      })
    );

const complete = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot complete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.fail(new Error('Cannot complete deleted TODO'))
          : current.completed
            ? Effect.succeed([])
            : Effect.succeed([
                {
                  type: 'TodoCompleted' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { completedAt: new Date() },
                } satisfies TodoCompleted,
              ]),
    })
  );

const uncomplete = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot uncomplete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.fail(new Error('Cannot uncomplete deleted TODO'))
          : !current.completed
            ? Effect.succeed([])
            : Effect.succeed([
                {
                  type: 'TodoUncompleted' as const,
                  metadata: { occurredAt: new Date(), originator: userId },
                  data: { uncompletedAt: new Date() },
                } satisfies TodoUncompleted,
              ]),
    })
  );

const deleteTodo = (userId: UserId) => (state: Readonly<Option.Option<TodoState>>) =>
  pipe(
    state,
    Option.match({
      onNone: () => Effect.fail(new Error('Cannot delete non-existent TODO')),
      onSome: (current) =>
        current.deleted
          ? Effect.succeed([])
          : Effect.succeed([
              {
                type: 'TodoDeleted' as const,
                metadata: { occurredAt: new Date(), originator: userId },
                data: { deletedAt: new Date() },
              } satisfies TodoDeleted,
            ]),
    })
  );
```

**Event Application:**

```typescript
import { Effect, Option, ParseResult, Schema, pipe } from 'effect';

interface TodoState {
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
}

type TodoEvent =
  | { type: 'TodoCreated'; data: { title: string } }
  | { type: 'TodoTitleChanged'; data: { title: string } }
  | { type: 'TodoCompleted' }
  | { type: 'TodoUncompleted' }
  | { type: 'TodoDeleted' };

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
        onSome: (currentState) => {
          switch (event.type) {
            case 'TodoTitleChanged':
              return Effect.succeed({
                ...currentState,
                title: event.data.title,
              });

            case 'TodoCompleted':
              return Effect.succeed({
                ...currentState,
                completed: true,
              });

            case 'TodoUncompleted':
              return Effect.succeed({
                ...currentState,
                completed: false,
              });

            case 'TodoDeleted':
              return Effect.succeed({
                ...currentState,
                deleted: true,
              });

            default:
              return Effect.succeed(currentState);
          }
        },
      })
    );
  };
```

**Aggregate Definition:**

```typescript
import { Effect, Schema, Option, ParseResult, pipe } from 'effect';
import { makeAggregateRoot, EventRecord } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

interface TodoState {
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
}

type TodoEvent =
  | { type: 'TodoCreated'; data: { title: string } }
  | { type: 'TodoTitleChanged'; data: { title: string } }
  | { type: 'TodoCompleted' }
  | { type: 'TodoUncompleted' }
  | { type: 'TodoDeleted' };

const createTodo = () => () => Effect.succeed([]);
const changeTitle = () => () => Effect.succeed([]);
const complete = () => () => Effect.succeed([]);
const uncomplete = () => () => Effect.succeed([]);
const deleteTodo = () => () => Effect.succeed([]);
const applyEvent =
  (_state: Readonly<Option.Option<TodoState>>) =>
  (_event: Readonly<TodoEvent>): Effect.Effect<TodoState, ParseResult.ParseError> =>
    Effect.succeed({ title: '', completed: false, deleted: false });

export class TodoAggregate extends Effect.Tag('TodoAggregate')<
  TodoAggregate,
  EventStore<EventRecord<TodoEvent, UserId>>
>() {}

export const TodoAggregateRoot = makeAggregateRoot(TodoId, UserId, applyEvent, TodoAggregate, {
  createTodo,
  changeTitle,
  complete,
  uncomplete,
  deleteTodo,
});
```

#### 2. TodoListAggregate

Single instance that maintains the collection of all TODOs.

**Identity:**

```typescript
// Always uses the same ID for the singleton list
const TODO_LIST_ID = 'todo-list' as const;
type TodoListId = typeof TODO_LIST_ID;
```

**Events:**

```typescript
import { Schema } from 'effect';
import { eventSchema } from '@codeforbreakfast/eventsourcing-aggregates';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

const TodoAddedToList = eventSchema(Schema.Literal('TodoAddedToList'), {
  todoId: TodoId,
  title: Schema.String,
  addedAt: Schema.ValidDateFromSelf,
});
type TodoAddedToList = typeof TodoAddedToList.Type;

const TodoRemovedFromList = eventSchema(Schema.Literal('TodoRemovedFromList'), {
  todoId: TodoId,
  removedAt: Schema.ValidDateFromSelf,
});
type TodoRemovedFromList = typeof TodoRemovedFromList.Type;

const TodoListEvent = Schema.Union(TodoAddedToList, TodoRemovedFromList);
type TodoListEvent = typeof TodoListEvent.Type;
```

**State:**

```typescript
import { Schema } from 'effect';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

export interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}
```

**Commands:**

```typescript
import { Effect, Option, Schema } from 'effect';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}

type TodoAddedToList = {
  type: 'TodoAddedToList';
  metadata: { occurredAt: Date; originator: UserId };
  data: { todoId: TodoId; title: string; addedAt: Date };
};
type TodoRemovedFromList = {
  type: 'TodoRemovedFromList';
  metadata: { occurredAt: Date; originator: UserId };
  data: { todoId: TodoId; removedAt: Date };
};

const addTodo =
  (userId: UserId, todoId: TodoId, title: string) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoAddedToList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (currentState.todoIds.has(todoId)) {
      return Effect.succeed([]);
    }

    return Effect.succeed([
      {
        type: 'TodoAddedToList' as const,
        metadata: { occurredAt: new Date(), originator: userId },
        data: { todoId, title, addedAt: new Date() },
      } satisfies TodoAddedToList,
    ]);
  };

const removeTodo =
  (userId: UserId, todoId: TodoId) =>
  (
    state: Readonly<Option.Option<TodoListState>>
  ): Effect.Effect<readonly TodoRemovedFromList[], never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (!currentState.todoIds.has(todoId)) {
      return Effect.succeed([]);
    }

    return Effect.succeed([
      {
        type: 'TodoRemovedFromList' as const,
        metadata: { occurredAt: new Date(), originator: userId },
        data: { todoId, removedAt: new Date() },
      } satisfies TodoRemovedFromList,
    ]);
  };
```

**Event Application:**

```typescript
import { Effect, Option, Schema } from 'effect';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}

type TodoListEvent =
  | { type: 'TodoAddedToList'; data: { todoId: TodoId } }
  | { type: 'TodoRemovedFromList'; data: { todoId: TodoId } };

const applyEvent =
  (state: Readonly<Option.Option<TodoListState>>) =>
  (event: Readonly<TodoListEvent>): Effect.Effect<TodoListState, never> => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListState => ({ todoIds: new Set<TodoId>() })
    );

    if (event.type === 'TodoAddedToList') {
      const newTodoIds = new Set<TodoId>([...currentState.todoIds, event.data.todoId]);
      return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
    }

    if (event.type === 'TodoRemovedFromList') {
      const newTodoIds = new Set<TodoId>(
        [...currentState.todoIds].filter((id) => id !== event.data.todoId)
      );
      return Effect.succeed<TodoListState>({ todoIds: newTodoIds });
    }

    return Effect.succeed<TodoListState>(currentState);
  };
```

**Aggregate Definition:**

```typescript
import { Effect, Schema, Option } from 'effect';
import { makeAggregateRoot, EventRecord } from '@codeforbreakfast/eventsourcing-aggregates';
import { EventStore } from '@codeforbreakfast/eventsourcing-store';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

const UserId = Schema.String.pipe(Schema.brand('UserId'));
type UserId = typeof UserId.Type;

interface TodoListState {
  readonly todoIds: ReadonlySet<TodoId>;
}

type TodoListEvent =
  | { type: 'TodoAddedToList'; data: { todoId: TodoId } }
  | { type: 'TodoRemovedFromList'; data: { todoId: TodoId } };

const addTodo = () => () => Effect.succeed([]);
const removeTodo = () => () => Effect.succeed([]);
const applyEvent =
  (_state: Readonly<Option.Option<TodoListState>>) =>
  (_event: Readonly<TodoListEvent>): Effect.Effect<TodoListState, never> =>
    Effect.succeed({ todoIds: new Set<TodoId>() });

export class TodoListAggregate extends Effect.Tag('TodoListAggregate')<
  TodoListAggregate,
  EventStore<EventRecord<TodoListEvent, UserId>>
>() {}

export const TodoListAggregateRoot = makeAggregateRoot(
  Schema.String.pipe(Schema.brand('TodoListId')),
  UserId,
  applyEvent,
  TodoListAggregate,
  {
    addTodo,
    removeTodo,
  }
);
```

## Event Bus

Enables process managers to react to events across aggregates without global ordering.

**Service Definition:**

```typescript
import { Effect, Stream, Context, PubSub, Scope } from 'effect';

interface DomainEvent {
  readonly streamId: string;
  readonly event: TodoEvent | TodoListEvent;
}

interface EventBus {
  readonly publish: (streamId: string, event: TodoEvent | TodoListEvent) => Effect.Effect<void>;

  readonly subscribe: <TEvent extends DomainEvent['event']>(
    filter: (event: DomainEvent['event']) => event is TEvent
  ) => Effect.Effect<
    Stream.Stream<{ readonly streamId: string; readonly event: TEvent }>,
    never,
    Scope.Scope
  >;
}

class EventBus extends Context.Tag('EventBus')<EventBus, EventBus>() {}
```

**Implementation:**

```typescript
import { Effect, Stream, PubSub, Scope, pipe } from 'effect';

interface DomainEvent {
  readonly streamId: string;
  readonly event: TodoEvent | TodoListEvent;
}

type TodoEvent = { type: 'TodoCreated' } | { type: 'TodoDeleted' };
type TodoListEvent = { type: 'TodoAddedToList' } | { type: 'TodoRemovedFromList' };

interface EventBus {
  readonly publish: (streamId: string, event: TodoEvent | TodoListEvent) => Effect.Effect<void>;
  readonly subscribe: <TEvent extends DomainEvent['event']>(
    filter: (event: DomainEvent['event']) => event is TEvent
  ) => Effect.Effect<
    Stream.Stream<{ readonly streamId: string; readonly event: TEvent }>,
    never,
    Scope.Scope
  >;
}

const makeEventBus = (): Effect.Effect<EventBus, never, Scope.Scope> =>
  pipe(
    PubSub.unbounded<DomainEvent>(),
    Effect.map((pubsub: PubSub.PubSub<DomainEvent>) => ({
      publish: (streamId: string, event: TodoEvent | TodoListEvent) =>
        PubSub.publish(pubsub, { streamId, event }),

      subscribe: <TEvent extends DomainEvent['event']>(
        filter: (event: DomainEvent['event']) => event is TEvent
      ) =>
        pipe(
          pubsub,
          (p: PubSub.PubSub<DomainEvent>) => Stream.fromPubSub(p),
          Stream.filter(
            (
              domainEvent: DomainEvent
            ): domainEvent is { readonly streamId: string; readonly event: TEvent } =>
              filter(domainEvent.event)
          ),
          Effect.succeed
        ),
    }))
  );
```

## Process Manager

Coordinates TodoAggregate and TodoListAggregate by reacting to events.

**Type Guard Helpers:**

```typescript
interface DomainEvent {
  readonly streamId: string;
  readonly event: TodoEvent | TodoListEvent;
}

type TodoEvent =
  | { type: 'TodoCreated'; data: { title: string } }
  | { type: 'TodoDeleted' }
  | { type: 'TodoCompleted' }
  | { type: 'TodoUncompleted' };
type TodoListEvent = { type: 'TodoAddedToList' } | { type: 'TodoRemovedFromList' };
type TodoCreated = Extract<TodoEvent, { type: 'TodoCreated' }>;
type TodoDeleted = Extract<TodoEvent, { type: 'TodoDeleted' }>;
type TodoCompleted = Extract<TodoEvent, { type: 'TodoCompleted' }>;
type TodoUncompleted = Extract<TodoEvent, { type: 'TodoUncompleted' }>;

const isTodoCreated = (event: DomainEvent['event']): event is TodoCreated =>
  event.type === 'TodoCreated';

const isTodoDeleted = (event: DomainEvent['event']): event is TodoDeleted =>
  event.type === 'TodoDeleted';

const isTodoCompleted = (event: DomainEvent['event']): event is TodoCompleted =>
  event.type === 'TodoCompleted';

const isTodoUncompleted = (event: DomainEvent['event']): event is TodoUncompleted =>
  event.type === 'TodoUncompleted';
```

**Process Manager Implementation:**

```typescript
import { Effect, Stream, Scope, pipe } from 'effect';

type TodoEvent =
  | { type: 'TodoCreated'; data: { title: string } }
  | { type: 'TodoDeleted' }
  | { type: 'TodoCompleted' }
  | { type: 'TodoUncompleted' };
type TodoCreated = Extract<TodoEvent, { type: 'TodoCreated' }>;
type TodoDeleted = Extract<TodoEvent, { type: 'TodoDeleted' }>;
type TodoCompleted = Extract<TodoEvent, { type: 'TodoCompleted' }>;
type TodoUncompleted = Extract<TodoEvent, { type: 'TodoUncompleted' }>;

const TODO_LIST_ID = 'singleton-todo-list' as const;
class EventBus extends Effect.Tag('EventBus')<EventBus, any>() {}
class TodoListAggregate extends Effect.Tag('TodoListAggregate')<TodoListAggregate, any>() {}

const isTodoCreated = (event: any): event is TodoCreated => event.type === 'TodoCreated';
const isTodoDeleted = (event: any): event is TodoDeleted => event.type === 'TodoDeleted';
const isTodoCompleted = (event: any): event is TodoCompleted => event.type === 'TodoCompleted';
const isTodoUncompleted = (event: any): event is TodoUncompleted =>
  event.type === 'TodoUncompleted';

const handleTodoCreated = (streamId: string, event: TodoCreated): Effect.Effect<void, Error> =>
  Effect.void;

const handleTodoDeleted = (streamId: string, _event: TodoDeleted): Effect.Effect<void, Error> =>
  Effect.void;

const handleTodoCompleted = (streamId: string, _event: TodoCompleted): Effect.Effect<void, Error> =>
  Effect.void;

const handleTodoUncompleted = (
  streamId: string,
  _event: TodoUncompleted
): Effect.Effect<void, Error> => Effect.void;

const runTodoListProcessManager = (): Effect.Effect<
  never,
  Error,
  typeof EventBus | typeof TodoListAggregate | Scope.Scope
> =>
  pipe(
    EventBus,
    Effect.flatMap(
      (eventBus: any) =>
        Effect.all([
          pipe(
            eventBus.subscribe(isTodoCreated),
            Effect.flatMap((stream: Stream.Stream<{ streamId: string; event: TodoCreated }>) =>
              Stream.runForEach(
                stream,
                ({ streamId, event }: { streamId: string; event: TodoCreated }) =>
                  handleTodoCreated(streamId, event)
              )
            ),
            Effect.fork
          ),
          pipe(
            eventBus.subscribe(isTodoDeleted),
            Effect.flatMap((stream: Stream.Stream<{ streamId: string; event: TodoDeleted }>) =>
              Stream.runForEach(
                stream,
                ({ streamId, event }: { streamId: string; event: TodoDeleted }) =>
                  handleTodoDeleted(streamId, event)
              )
            ),
            Effect.fork
          ),
          pipe(
            eventBus.subscribe(isTodoCompleted),
            Effect.flatMap((stream: Stream.Stream<{ streamId: string; event: TodoCompleted }>) =>
              Stream.runForEach(
                stream,
                ({ streamId, event }: { streamId: string; event: TodoCompleted }) =>
                  handleTodoCompleted(streamId, event)
              )
            ),
            Effect.fork
          ),
          pipe(
            eventBus.subscribe(isTodoUncompleted),
            Effect.flatMap((stream: Stream.Stream<{ streamId: string; event: TodoUncompleted }>) =>
              Stream.runForEach(
                stream,
                ({ streamId, event }: { streamId: string; event: TodoUncompleted }) =>
                  handleTodoUncompleted(streamId, event)
              )
            ),
            Effect.fork
          ),
        ]) as Effect.Effect<[any, any, any, any], Error, typeof TodoListAggregate | Scope.Scope>
    ) as unknown as (
      a: typeof EventBus
    ) => Effect.Effect<[any, any, any, any], Error, typeof TodoListAggregate | Scope.Scope>,
    Effect.flatMap(() => Effect.never as Effect.Effect<never, never, never>)
  );
```

## Projections

### TodoProjection

Rebuilds individual TODO state from TodoAggregate stream.

```typescript
import { Context, Effect, Option, Schema } from 'effect';
import type { ProjectionEventStore } from '@codeforbreakfast/eventsourcing-projections';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

interface TodoProjection {
  readonly id: TodoId;
  readonly title: string;
  readonly completed: boolean;
  readonly deleted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type TodoEvent =
  | { type: 'TodoCreated'; data: { title: string; createdAt: Date } }
  | { type: 'TodoTitleChanged'; data: { title: string; changedAt: Date } }
  | { type: 'TodoCompleted'; data: { completedAt: Date } }
  | { type: 'TodoUncompleted'; data: { uncompletedAt: Date } }
  | { type: 'TodoDeleted'; data: { deletedAt: Date } };

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
    return Effect.succeed(
      Option.getOrElse(state, () => ({
        id: todoId,
        title: '',
        completed: false,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  };

const TodoProjectionEventStore = Context.GenericTag<ProjectionEventStore<TodoEvent>>(
  'TodoProjectionEventStore'
);
```

### TodoListProjection

Rebuilds the list from TodoListAggregate stream.

```typescript
import { Context, Effect, Option, Schema } from 'effect';
import type { ProjectionEventStore } from '@codeforbreakfast/eventsourcing-projections';

const TodoId = Schema.String.pipe(Schema.brand('TodoId'));
type TodoId = typeof TodoId.Type;

interface TodoListProjection {
  readonly todoIds: ReadonlySet<TodoId>;
}

type TodoListEvent =
  | { type: 'TodoAddedToList'; data: { todoId: TodoId } }
  | { type: 'TodoRemovedFromList'; data: { todoId: TodoId } };

const applyEvent =
  (state: Readonly<Option.Option<TodoListProjection>>) => (event: Readonly<TodoListEvent>) => {
    const currentState = Option.getOrElse(
      state,
      (): TodoListProjection => ({ todoIds: new Set<TodoId>() })
    );
    return Effect.succeed(currentState);
  };

const TodoListProjectionEventStore = Context.GenericTag<ProjectionEventStore<TodoListEvent>>(
  'TodoListProjectionEventStore'
);
```

## CLI Interface

Simple Bun CLI demonstrating operations:

```bash
# Create a new TODO
bun run cli.ts add "Buy milk"
# => Created TODO: todo-abc123

# Complete a TODO
bun run cli.ts complete todo-abc123
# => Marked todo-abc123 as complete

# List all TODOs
bun run cli.ts list
# =>
# [ ] todo-xyz789: Write design doc
# [x] todo-abc123: Buy milk

# Show TODO details
bun run cli.ts show todo-abc123
# =>
# ID: todo-abc123
# Title: Buy milk
# Status: Completed
# Created: 2025-10-07T10:30:00Z
# Updated: 2025-10-07T11:15:00Z
```

## File Structure

```
examples/todo-app/
├── src/
│   ├── domain/
│   │   ├── todo-aggregate.ts          # TodoAggregate definition
│   │   ├── todo-list-aggregate.ts     # TodoListAggregate definition
│   │   └── types.ts                   # Shared domain types
│   ├── infrastructure/
│   │   ├── event-bus.ts               # EventBus implementation
│   │   └── stores.ts                  # Event store setup
│   ├── process-managers/
│   │   └── todo-list-pm.ts            # Process manager
│   ├── projections/
│   │   ├── todo-projection.ts         # Individual TODO projection
│   │   └── todo-list-projection.ts    # List projection
│   ├── cli/
│   │   ├── index.ts                   # CLI entry point
│   │   └── commands.ts                # CLI command handlers
│   └── app.ts                         # Application wiring
├── tests/
│   ├── todo-aggregate.test.ts         # TodoAggregate tests
│   ├── todo-list-aggregate.test.ts    # TodoListAggregate tests
│   ├── process-manager.test.ts        # Process manager tests
│   └── projections.test.ts            # Projection tests
├── package.json
├── tsconfig.json
├── DESIGN.md                          # This file
└── README.md                          # Usage guide
```

## Key Patterns Demonstrated

1. **Multiple Aggregate Types** - TodoAggregate and TodoListAggregate with clear boundaries
2. **Event-Driven Architecture** - Process manager reacts to events via EventBus
3. **No Global Ordering** - EventBus doesn't guarantee order across aggregates
4. **Idempotency** - Process manager handles duplicate events gracefully
5. **Type Safety** - Strong types throughout with Schema validation
6. **Effect Patterns** - Proper use of Effect, Stream, PubSub, Scope
7. **CQRS** - Separate write (aggregates) and read (projections) models
8. **Testing** - Comprehensive tests for all components

## Dependencies

```json
{
  "dependencies": {
    "@codeforbreakfast/eventsourcing-aggregates": "workspace:*",
    "@codeforbreakfast/eventsourcing-commands": "workspace:*",
    "@codeforbreakfast/eventsourcing-projections": "workspace:*",
    "@codeforbreakfast/eventsourcing-store": "workspace:*",
    "@codeforbreakfast/eventsourcing-store-inmemory": "workspace:*",
    "effect": "^3.18.1"
  },
  "devDependencies": {
    "@codeforbreakfast/bun-test-effect": "workspace:*",
    "typescript": "^5.9.3"
  }
}
```
