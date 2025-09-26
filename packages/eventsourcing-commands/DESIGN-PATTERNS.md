# Command Type Safety Design Patterns

This document explains the improved command type safety patterns and how to migrate from the old `Schema.Unknown` approach.

## 🔥 The Problem We Solved

The original implementation had a **critical type safety flaw**:

```typescript
// ❌ OLD: Type safety killer
export const Command = Schema.Struct({
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown, // 💥 All type safety lost here!
});
```

This approach had several problems:

1. **Zero type safety** for command payloads
2. **No validation** at system boundaries
3. **String-based errors** instead of structured error types
4. **Runtime failures** instead of compile-time safety
5. **Poor developer experience** with no autocomplete or refactoring support

## ✅ The Solution: Proper Boundary Separation

We now separate three distinct concerns:

### 1. **Wire Transport** (Serialization Boundary)

```typescript
// For transport/serialization - keeps Schema.Unknown for flexibility
export const WireCommand = Schema.Struct({
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown, // OK here - this is the wire format
});
```

### 2. **Domain Models** (Type-Safe Business Logic)

```typescript
// For domain logic - fully type-safe
export interface DomainCommand<TPayload = unknown> {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: TPayload; // Strongly typed!
}
```

### 3. **Validation Bridge** (Schema → Domain)

```typescript
// Validates wire commands into domain commands
export const validateCommand =
  <TPayload>(payloadSchema: Schema.Schema<TPayload>) =>
  (wireCommand: WireCommand) =>
    pipe(
      wireCommand.payload,
      Schema.decodeUnknown(payloadSchema), // Validation happens HERE
      Schema.map(
        (payload): DomainCommand<TPayload> => ({
          ...wireCommand,
          payload, // Now strongly typed!
        })
      )
    );
```

## 🎯 Usage Patterns

### Pattern 1: Define Type-Safe Commands

```typescript
import { Schema } from 'effect';
import { createCommandSchema } from '@codeforbreakfast/eventsourcing-commands';

// Define your payload schema with validation rules
const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({ description: 'Valid email address' })
  ),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  age: Schema.optional(Schema.Number.pipe(Schema.between(18, 100))),
});

// Create the command schema
const CreateUserCommand = createCommandSchema('CreateUser', CreateUserPayload);
type CreateUserCommand = typeof CreateUserCommand.Type; // Fully typed!
```

### Pattern 2: Implement Command Handlers

```typescript
import { Effect } from 'effect';
import { DomainCommand, CommandHandler } from '@codeforbreakfast/eventsourcing-commands';

// Your handler gets a fully typed command
const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) => {
    // command.payload is fully typed here!
    // ✅ TypeScript knows: command.payload.email is string
    // ✅ TypeScript knows: command.payload.age is number | undefined

    return Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target as any, eventNumber: 1 },
    });
  },
};
```

### Pattern 3: Register and Dispatch Commands

```typescript
import { registerCommand, dispatchCommand } from '@codeforbreakfast/eventsourcing-commands';

// Register your command with validation
const setupCommands = () => registerCommand('CreateUser', CreateUserPayload, createUserHandler);

// Dispatch commands safely
const processIncomingCommand = (wireCommand: WireCommand) =>
  pipe(
    dispatchCommand(wireCommand), // Validation happens automatically
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Success') {
          console.log('Command succeeded!');
        } else {
          // Structured error handling
          switch (result.error._tag) {
            case 'ValidationError':
              console.error('Invalid payload:', result.error.validationErrors);
              break;
            case 'HandlerNotFound':
              console.error('No handler for:', result.error.commandName);
              break;
            case 'ExecutionError':
              console.error('Execution failed:', result.error.message);
              break;
          }
        }
      })
    )
  );
```

## 🔄 Migration Guide

### Step 1: Update Your Command Definitions

**Before:**

```typescript
// ❌ Old way - no type safety
const processCommand = (command: Command) => {
  const payload = command.payload as any; // 😱 Type assertion required!
  // No validation, runtime errors inevitable
};
```

**After:**

```typescript
// ✅ New way - full type safety
const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.pipe(Schema.minLength(1)),
});

const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) => {
    // command.payload is strongly typed - no type assertions needed!
    console.log(`Creating user: ${command.payload.email}`);
    return Effect.succeed(result);
  },
};
```

### Step 2: Replace String Errors with Structured Errors

**Before:**

```typescript
// ❌ Old way - string errors
return { _tag: 'Failure', error: 'Something went wrong' };
```

**After:**

```typescript
// ✅ New way - structured errors
return {
  _tag: 'Failure',
  error: {
    _tag: 'ValidationError',
    commandId: command.id,
    commandName: command.name,
    validationErrors: ['Email format invalid', 'Name is required'],
  },
};
```

### Step 3: Use Command Registry

**Before:**

```typescript
// ❌ Old way - manual dispatch with no validation
const handleCommand = (command: Command) => {
  switch (command.name) {
    case 'CreateUser':
      return createUser(command.payload as any); // Type assertion hell!
    // ... more cases
  }
};
```

**After:**

```typescript
// ✅ New way - automatic validation and dispatch
const setup = () =>
  Effect.all([
    registerCommand('CreateUser', CreateUserPayload, createUserHandler),
    registerCommand('UpdateUser', UpdateUserPayload, updateUserHandler),
    // Registry handles validation and dispatch automatically
  ]);

const handleCommand = (wireCommand: WireCommand) => dispatchCommand(wireCommand); // Validation + dispatch in one call!
```

## 🏗️ Architecture Benefits

### 1. **Clear Boundaries**

- **Wire Layer**: JSON/transport - uses `Schema.Unknown` appropriately
- **Domain Layer**: Business logic - fully type-safe
- **Validation Layer**: Schema validation at system boundaries only

### 2. **Functional Composition**

```typescript
// Each concern is a pure function that composes beautifully
const processCommand = (wireCommand: WireCommand) =>
  pipe(
    wireCommand,
    validateCommand(payloadSchema), // Wire → Domain
    Effect.flatMap(handler.handle), // Domain → Result
    Effect.mapError(mapToWireError) // Domain → Wire
  );
```

### 3. **Excellent Error Handling**

```typescript
// Structured errors provide rich information for debugging
type CommandError =
  | { _tag: 'ValidationError'; validationErrors: string[] }
  | { _tag: 'HandlerNotFound'; availableHandlers: string[] }
  | { _tag: 'ExecutionError'; cause: unknown }
  | { _tag: 'ConcurrencyConflict'; expectedVersion: number };
// ... more structured error types
```

### 4. **Performance Optimized**

- Schema validation only at boundaries (not everywhere)
- No runtime type checks in domain logic
- Efficient serialization/deserialization
- Proper caching of validated commands

## 🎪 Advanced Patterns

### Pattern: Command Versioning

```typescript
const CreateUserV1 = Schema.Struct({
  email: Schema.String,
  name: Schema.String,
});

const CreateUserV2 = Schema.Struct({
  email: Schema.String,
  name: Schema.String,
  profile: Schema.optional(
    Schema.Struct({
      bio: Schema.String,
      avatar: Schema.String,
    })
  ),
});

// Handle multiple versions gracefully
const migrateCreateUser = (wireCommand: WireCommand) =>
  pipe(
    wireCommand.payload,
    Schema.decodeUnknown(Schema.Union(CreateUserV2, CreateUserV1)),
    Effect.map(
      (payload) =>
        'profile' in payload
          ? payload // V2 command
          : { ...payload, profile: undefined } // V1 → V2 migration
    )
  );
```

### Pattern: Command Composition

```typescript
// Compose multiple commands into a transaction
const BulkUserOperation = Schema.Struct({
  operations: Schema.Array(
    Schema.Union(
      Schema.Struct({ type: Schema.Literal('create'), data: CreateUserPayload }),
      Schema.Struct({ type: Schema.Literal('update'), data: UpdateUserPayload }),
      Schema.Struct({ type: Schema.Literal('delete'), data: DeleteUserPayload })
    )
  ),
});

const bulkHandler: CommandHandler<DomainCommand<typeof BulkUserOperation.Type>> = {
  handle: (command) =>
    pipe(
      command.payload.operations,
      Effect.forEach((op) =>
        pipe(
          op.type,
          Match.value,
          Match.when('create', () => createUserHandler.handle(makeCommand('CreateUser', op.data))),
          Match.when('update', () => updateUserHandler.handle(makeCommand('UpdateUser', op.data))),
          Match.when('delete', () => deleteUserHandler.handle(makeCommand('DeleteUser', op.data))),
          Match.exhaustive
        )
      ),
      Effect.map((results) => ({ _tag: 'Success' as const, results }))
    ),
};
```

## 🔍 Testing Patterns

### Pattern: Type-Safe Test Commands

```typescript
import { expect, test } from 'bun:test';

test('command validation', async () => {
  const validCommand: WireCommand = {
    id: 'test-123',
    target: 'user-456',
    name: 'CreateUser',
    payload: {
      email: 'test@example.com',
      name: 'Test User',
    },
  };

  const result = await Effect.runPromise(
    pipe(validCommand, validateCommand(CreateUserPayload), Effect.either)
  );

  expect(result._tag).toBe('Right');
  if (result._tag === 'Right') {
    // TypeScript knows the exact shape here!
    expect(result.right.payload.email).toBe('test@example.com');
    expect(result.right.payload.name).toBe('Test User');
  }
});
```

## 🚀 Performance Considerations

1. **Validation Only at Boundaries**: Schema validation happens once when commands enter the system, not repeatedly throughout processing.

2. **Efficient Serialization**: Wire commands use `Schema.Unknown` for efficient JSON serialization without type information loss.

3. **Memory Efficiency**: Domain commands are immutable and share structure where possible.

4. **Caching**: Command handlers and schemas can be cached for repeated use.

## 🎯 Best Practices

1. **Always validate at system boundaries** (HTTP endpoints, WebSocket handlers, message queues)
2. **Use domain types internally** for business logic
3. **Structure your errors** for better debugging and handling
4. **Compose commands functionally** using Effect patterns
5. **Version your command schemas** for backward compatibility
6. **Test command validation thoroughly** - it's your safety net!

This new approach gives you **bulletproof type safety** without sacrificing **performance** or **usability**. The separation of concerns makes the system much more maintainable and reduces runtime errors significantly.
