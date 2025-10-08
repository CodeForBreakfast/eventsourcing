# Automatic Metadata Enrichment Design

## Problem

Currently, every command function must manually call `eventMetadata<UserId>()` and attach metadata to events. This creates repetition and couples business logic to infrastructure concerns.

```typescript
// Current - every command does this
const createTodo = (title: string) => () =>
  pipe(
    eventMetadata<UserId>(),
    Effect.map((metadata) => [
      {
        type: 'TodoCreated',
        metadata, // Manual attachment
        data: { title, createdAt: new Date() },
      },
    ])
  );
```

## Solution

Commands emit bare events (business data only). The framework automatically enriches events with metadata before persisting them.

## Type Structure

### Event (what commands emit)

```typescript
// Bare business events - no infrastructure concerns
interface TodoCreated {
  readonly type: 'TodoCreated';
  readonly data: {
    readonly title: string;
    readonly createdAt: Date;
  };
}

type TodoEvent = TodoCreated | TodoTitleChanged | TodoCompleted | ...;
```

### EventRecord (what gets stored)

```typescript
// Framework-enriched events with metadata
interface EventMetadata<TOrigin> {
  readonly occurredAt: Date;
  readonly origin: TOrigin; // Flexible - can be userId, system, API context, etc.
}

type EventRecord<TEvent, TOrigin> = TEvent & {
  readonly metadata: EventMetadata<TOrigin>;
};

// What actually gets persisted
type TodoEventRecord = EventRecord<TodoEvent, UserId>;
```

## Naming Conventions

- **`origin`**: The stored metadata field. Flexible - can contain userId, system identifier, IP address, session context, etc.
- **`initiator`**: Used in CommandContext API. Specifically refers to "who/what initiated this command"
- **`provideCommandInitiator`**: Helper to provide the initiator to CommandContext
- **`CommandContext.getInitiator`**: Gets the initiator from context

Rationale: `initiator` has specific meaning (who triggered the action), while `origin` is broader (where did this come from, including context).

## Architecture Flow

### Current Flow

```
Command → calls eventMetadata() → returns Event[] with metadata → commit → store
```

### Proposed Flow

```
Command → returns Event[] (bare) → commit → enriches with metadata → store EventRecord[]
                                      ↓
                               eventMetadata()
                                      ↓
                            CommandContext.getInitiator
```

## Implementation Points

### 1. Commit Function Enrichment

Location: `packages/eventsourcing-aggregates/src/lib/aggregateRootEventStream.ts` (lines 111-121)

```typescript
// Add metadata enrichment in commit
const enrichEventWithMetadata = <TEvent, TOrigin>(
  event: TEvent,
  metadata: EventMetadata<TOrigin>
): EventRecord<TEvent, TOrigin> => ({
  ...event,
  metadata,
});

const enrichEventsWithMetadata = <TEvent, TOrigin>(events: Chunk.Chunk<TEvent>) =>
  pipe(
    eventMetadata<TOrigin>(),
    Effect.map((metadata) => Chunk.map(events, (event) => enrichEventWithMetadata(event, metadata)))
  );

const commit =
  <TId extends string, TEvent, TOrigin, TTag>(
    eventstoreTag: Readonly<Context.Tag<TTag, EventStore<EventRecord<TEvent, TOrigin>>>>
  ) =>
  (options: CommitOptions<TId>) =>
    pipe(
      options.events as Chunk.Chunk<TEvent>,
      enrichEventsWithMetadata<TEvent, TOrigin>,
      Effect.flatMap((enrichedEvents) =>
        pipe(
          eventstoreTag,
          Effect.flatMap(commitToEventStore(options.id, options.eventNumber, enrichedEvents))
        )
      )
    );
```

### 2. Event Store Types

The EventStore service stores `EventRecord<TEvent, TOrigin>`, not bare `TEvent`:

```typescript
class TodoAggregate extends Effect.Tag('TodoAggregate')<
  TodoAggregate,
  EventStore<EventRecord<TodoEvent, UserId>> // Store records, not bare events
>() {}
```

### 3. Apply Function

The `applyEvent` function receives bare events (business data only):

```typescript
const applyEvent =
  (state: Readonly<Option.Option<TodoState>>) =>
  (event: Readonly<TodoEvent>): Effect.Effect<TodoState, ParseResult.ParseError> => {
    // Receives bare business events - no metadata
    // Focus on business logic only

    if (event.type === 'TodoCreated') {
      return Effect.succeed({
        title: event.data.title,
        completed: false,
        deleted: false,
      });
    }
    // ...
  };
```

### 4. Command Signatures

Commands become simpler - they only deal with business logic:

```typescript
// Simple command - no initiator needed
const createTodo = (title: string) => () =>
  Effect.succeed([
    {
      type: 'TodoCreated' as const,
      data: { title, createdAt: new Date() },
    },
  ]);

// Command that needs initiator for business logic
const deleteTodo = (todoId: TodoId) => (state: TodoState) =>
  pipe(
    CommandContext<UserId>(),
    Effect.flatMap((ctx) => ctx.getInitiator),
    Effect.flatMap((userId) =>
      state.ownerId === userId
        ? Effect.succeed([{ type: 'TodoDeleted', data: { deletedAt: new Date() } }])
        : Effect.fail(new Error('Not authorized'))
    )
  );
```

### 5. Test Simplification

Most tests don't need `provideCommandInitiator`:

```typescript
// Before - every test needs this
pipe(
  TodoAggregateRoot.commands.createTodo('Buy milk')(),
  Effect.provide(provideCommandInitiator(TEST_USER))
);

// After - only provide when command uses it for business logic
TodoAggregateRoot.commands.createTodo('Buy milk')();

// Only tests for authorization commands need initiator
pipe(
  state,
  TodoAggregateRoot.commands.deleteTodo(todoId),
  Effect.provide(provideCommandInitiator(TEST_USER))
);
```

## Breaking Changes

### 1. Event Type Structure

**Before:**

```typescript
interface TodoCreated {
  readonly type: 'TodoCreated';
  readonly metadata: { readonly occurredAt: Date; readonly originator: UserId };
  readonly data: { readonly title: string };
}
```

**After:**

```typescript
// Commands emit
interface TodoCreated {
  readonly type: 'TodoCreated';
  readonly data: { readonly title: string };
}

// Store persists
type TodoCreatedRecord = EventRecord<TodoCreated, UserId>;
```

### 2. Command Signatures

All commands change from manually creating metadata to returning bare events.

**Before:**

```typescript
const createTodo = (title: string) => () =>
  pipe(
    eventMetadata<UserId>(),
    Effect.map((metadata) => [{ type: 'TodoCreated', metadata, data: { title } }])
  );
```

**After:**

```typescript
const createTodo = (title: string) => () =>
  Effect.succeed([{ type: 'TodoCreated', data: { title } }]);
```

### 3. Metadata Field Rename

`metadata.originator` → `metadata.origin`

### 4. EventStore Type Parameter

Event stores now store `EventRecord<TEvent, TOrigin>` instead of raw events with metadata baked in.

**Before:**

```typescript
EventStore<TodoEvent>; // TodoEvent already has metadata
```

**After:**

```typescript
EventStore<EventRecord<TodoEvent, UserId>>; // Framework adds metadata
```

### 5. applyEvent receives bare events

The `applyEvent` function signature changes to receive bare events without metadata:

**Before:**

```typescript
const applyEvent =
  (state: Option.Option<TodoState>) =>
  (event: EventRecord<TodoEvent, UserId>): Effect.Effect<TodoState, ParseResult.ParseError> => {
    // Had access to event.metadata.originator
  };
```

**After:**

```typescript
const applyEvent =
  (state: Option.Option<TodoState>) =>
  (event: TodoEvent): Effect.Effect<TodoState, ParseResult.ParseError> => {
    // Only has access to business data - no metadata
  };
```

### 6. Process Managers

Process managers receive `EventRecord` from the event bus:

**Before:**

```typescript
eventBus.subscribe((event: TodoCreated) => {
  const userId = event.metadata.originator; // Access from event itself
  // ...
});
```

**After:**

```typescript
eventBus.subscribe((event: EventRecord<TodoCreated, UserId>) => {
  const userId = event.metadata.origin; // Still accessible, renamed field
  // ...
});
```

## Benefits

1. **Separation of Concerns**: Commands focus purely on business logic
2. **Less Boilerplate**: No manual `eventMetadata()` calls in every command
3. **Simpler Tests**: Most tests don't need `provideCommandInitiator`
4. **Clearer Intent**: Bare events vs enriched records is explicit in types
5. **Flexibility**: `origin` can evolve to include richer context without changing command code
6. **Consistency**: Metadata enrichment is guaranteed and consistent across all events

## Open Questions

1. Should `eventSchema` helper function be updated to work with bare events or EventRecord?
2. Do we need a helper to easily extract business data from EventRecord in apply functions?
3. Should serialization/encoding happen at the bare Event level or EventRecord level?
