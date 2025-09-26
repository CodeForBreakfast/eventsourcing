# Type-Safe Command Registry

This implementation demonstrates how to leverage TypeScript's type system and Effect Schema to create **exhaustive command name validation at build time**.

## 🎯 What We've Achieved

### 1. **Compile-Time Command Name Constraints**

- Command names are derived from the registration object keys
- TypeScript enforces only valid command names can be used
- Adding a new command automatically updates the type system

### 2. **Runtime Schema Validation**

- Wire command schema only accepts known command names
- Unknown commands are rejected at parse time, not execution time
- Schema is generated from the same registry that defines valid commands

### 3. **Exhaustive Type Safety**

- Impossible to dispatch commands that don't exist
- TypeScript errors if you try to use unknown command names
- Perfect marriage of compile-time and runtime safety

## 🏗️ Core Architecture

### Type-Level Command Registry

```typescript
// Define your commands with their schemas and handlers
const registrations = buildCommandRegistrations({
  CreateUser: createCommandRegistration(CreateUserPayload, createUserHandler),
  UpdateEmail: createCommandRegistration(UpdateEmailPayload, updateEmailHandler),
  DeleteUser: createCommandRegistration(DeleteUserPayload, deleteUserHandler),
});

// TypeScript now knows these are the ONLY valid command names:
// "CreateUser" | "UpdateEmail" | "DeleteUser"
```

### Automatic Schema Generation

```typescript
// Schema automatically constrains to known command names
const WireCommandSchema = createWireCommandSchema(registrations);

// This will parse successfully
const validCommand = {
  id: 'cmd-1',
  name: 'CreateUser', // ✅ Valid
  // ...
};

// This will be rejected by schema
const invalidCommand = {
  id: 'cmd-2',
  name: 'UnknownCommand', // ❌ Rejected at runtime
  // ...
};
```

### Type-Safe Service Layer

```typescript
// Create typed service
const CommandService = createTypedCommandRegistryService<typeof registrations>();

// Use in Effect programs
const program = Effect.gen(function* () {
  const service = yield* CommandService;

  // TypeScript enforces valid command names
  const result = yield* service.dispatch({
    id: 'cmd-123',
    target: 'user-456',
    name: 'DeleteUser', // ✅ Exhaustively checked
    payload: { reason: 'Account closure' },
  });

  return result;
});
```

## 🚀 Key Benefits

### **No Runtime Surprises**

- Unknown commands fail at schema validation, not during execution
- Clear error messages with available command names
- Type-safe throughout the entire pipeline

### **Exhaustive Command Handling**

- Adding a new command updates all type constraints automatically
- Impossible to forget to handle a command type
- Compile-time guarantees about command registry completeness

### **Zero Overhead Type Safety**

- Uses TypeScript's existing type inference
- No runtime type checking overhead
- Schema validation only happens at boundaries

### **Elegant API**

- Simple to define new commands
- Natural functional composition
- Backward compatible with existing code

## 📋 Usage Examples

### Basic Command Definition

```typescript
// 1. Define payload schema
const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.pipe(Schema.minLength(1)),
});

// 2. Define handler
const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success',
      position: { streamId: command.target, eventNumber: 1 },
    }),
};

// 3. Register command
const registrations = buildCommandRegistrations({
  CreateUser: createCommandRegistration(CreateUserPayload, createUserHandler),
});
```

### Type-Safe Dispatch

```typescript
// Type-safe command creation
const command = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser' as const, // ✅ TypeScript validates this
  payload: {
    email: 'john@example.com',
    name: 'John Doe',
  },
};

// Type-safe dispatch
const registry = makeTypedCommandRegistry(registrations);
const result = await Effect.runPromise(registry.dispatch(command));
```

### Runtime Validation

```typescript
// Parse unknown wire commands safely
const parseWireCommand = (input: unknown) =>
  pipe(
    Schema.decodeUnknown(WireCommandSchema)(input),
    Effect.mapError(() => new Error('Invalid command format or unknown command name'))
  );

// Dispatch with runtime validation
const dispatchWireCommand = (wireCommand: WireCommand) => registry.dispatchUntypedWire(wireCommand);
```

## 🔧 Implementation Files

- **`/packages/eventsourcing-commands/src/lib/command-registry.ts`** - Core type-safe registry implementation
- **`/packages/eventsourcing-commands/src/lib/typed-command-registry.test.ts`** - Comprehensive test suite
- **`/packages/eventsourcing-commands/src/lib/typed-example.ts`** - Working example usage
- **`/packages/eventsourcing-commands/src/lib/type-safety-demo.ts`** - Type safety demonstrations

## 🎓 Type Magic Explained

The implementation uses several advanced TypeScript patterns:

1. **Mapped Types**: `keyof T` extracts command names as literal union types
2. **Template Literal Types**: Schema unions are built from registration keys
3. **Conditional Types**: Effect type inference maintains type safety through composition
4. **Branded Types**: Service tags ensure correct registry/command pairing

## 🔄 Migration Path

### For New Code

Use `makeTypedCommandRegistry()` and `createTypedCommandRegistryService()` for full type safety.

### For Existing Code

Legacy `makeCommandRegistry()` still works - provides gradual migration path without breaking changes.

## 🎯 The Scottish Verdict

This is exactly what ye wanted - a bloody brilliant use of TypeScript's type system to make command dispatch bulletproof. No more runtime surprises when some numpty tries to execute a command that doesnae exist!

The type system does the heavy lifting:

- **Build time**: TypeScript catches invalid command names
- **Runtime**: Schema rejects unknown commands before execution
- **Zero overhead**: All type checking happens at compile time

It's elegant, it's functional, and it's exactly the kind of type-level magic that makes TypeScript shine. 🏴󠁧󠁢󠁳󠁣󠁴󠁿
