# TODO App - Event Sourcing Example

A complete example application demonstrating event sourcing patterns using the `@codeforbreakfast/eventsourcing` packages.

## Architecture

This example demonstrates:

- **Event Sourcing**: All state changes are stored as events
- **CQRS**: Separate write models (aggregates) and read models (projections)
- **Process Manager**: Coordinates between aggregates using Effect.PubSub
- **Strong Typing**: TypeScript types with Effect Schema validation
- **Aggregate Root**: Domain entities that enforce business rules
- **Projections**: Read models built from event streams

## Structure

```
src/
├── domain/              # Domain models and business logic
│   ├── types.ts         # Branded types (TodoId, UserId)
│   ├── todoEvents.ts    # Events for Todo aggregate
│   ├── todoListEvents.ts # Events for TodoList aggregate
│   ├── todoAggregate.ts # Todo aggregate root
│   └── todoListAggregate.ts # TodoList aggregate root
├── infrastructure/      # Infrastructure concerns
│   ├── eventBus.ts      # Event publishing using PubSub
│   └── processManager.ts # Coordinates between aggregates
├── projections/         # Read models
│   ├── todoProjection.ts
│   └── todoListProjection.ts
└── cli.ts              # CLI interface

tests/
├── todoAggregate.test.ts
└── todoListAggregate.test.ts
```

## Key Concepts

### Two Aggregates

1. **TodoAggregate** - One per TODO item
   - Enforces business rules for a single TODO
   - Events: TodoCreated, TodoTitleChanged, TodoCompleted, TodoUncompleted, TodoDeleted

2. **TodoListAggregate** - Singleton collection
   - Maintains the list of all TODOs
   - Events: TodoAddedToList, TodoRemovedFromList

### Process Manager

The process manager listens for domain events and coordinates between aggregates:

- When a TODO is created → adds it to the list
- When a TODO is deleted → removes it from the list

This uses Effect.PubSub for event distribution without guaranteeing global ordering (important for scalability).

### Projections

Each aggregate has its own projection for read models:

- **TodoProjection** - Current state of a single TODO
- **TodoListProjection** - List of all TODOs with metadata

## Usage

```bash
# Install dependencies
bun install

# Create a TODO
bun run src/cli.ts create "Buy milk"

# List all TODOs
bun run src/cli.ts list

# Complete a TODO
bun run src/cli.ts complete <todo-id>

# Uncomplete a TODO
bun run src/cli.ts uncomplete <todo-id>

# Delete a TODO
bun run src/cli.ts delete <todo-id>

# Show help
bun run src/cli.ts help
```

## Testing

```bash
bun test
```

The tests demonstrate:

- Testing command handlers in isolation
- Testing business rule enforcement
- Using Effect.either for error handling
- Idempotency checks (operations that return empty events)

## Design Decisions

1. **Two Aggregates**: Each TODO is its own aggregate for proper boundaries. The list is a separate aggregate to track the collection.

2. **Process Manager as Domain Code**: The process manager is domain-specific code, not a framework concern.

3. **No Global Ordering**: Events across aggregates are not ordered, enabling horizontal scaling.

4. **Strong Typing**: Branded types and Schema validation throughout for type safety.

5. **Idempotency**: Command handlers return empty event arrays when state is already correct.

6. **Effect PubSub**: Used for cross-aggregate communication without tight coupling.

## Learning Points

This example shows:

- How to design aggregate boundaries
- When to use process managers vs sagas
- How to coordinate multiple aggregates
- How to build projections from event streams
- How to test event-sourced systems
- How to use Effect library patterns
