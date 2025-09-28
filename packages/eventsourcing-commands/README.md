# @codeforbreakfast/eventsourcing-commands

CQRS command types and schemas for event sourcing. This package provides core command handling abstractions with type-safe command and result definitions, featuring a strongly typed command registry system.

## Overview

This package contains the fundamental CQRS (Command Query Responsibility Segregation) types that bridge the gap between user intentions and domain events. Commands represent requests to change system state, while command results indicate the outcome of processing those commands.

The package features a **typed command registry** that ensures each command name is tied to exactly one payload schema, providing compile-time safety and exhaustive validation.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-commands
```

## Key Concepts

- **Commands**: Represent user intent to change aggregate state
- **Command Results**: Indicate success/failure of command processing
- **Type Safety**: Full TypeScript support with Effect schemas
- **Typed Registry**: Compile-time validation and exhaustive command schemas
- **Payload Validation**: Automatic schema-based validation for all commands

## Quick Start

### 1. Define Your Commands

```typescript
import { Schema } from 'effect';
import { defineCommand } from '@codeforbreakfast/eventsourcing-commands';

// Define command payload schemas
const CreateUserPayload = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
});

const UpdateEmailPayload = Schema.Struct({
  newEmail: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
});

// Create command definitions
const createUserCommand = defineCommand('CreateUser', CreateUserPayload);
const updateEmailCommand = defineCommand('UpdateEmail', UpdateEmailPayload);
```

### 2. Create Command Handlers

```typescript
import { Effect } from 'effect';
import { CommandHandler, DomainCommand } from '@codeforbreakfast/eventsourcing-commands';

const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target, eventNumber: 1 },
    }),
};

const updateEmailHandler: CommandHandler<DomainCommand<typeof UpdateEmailPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target, eventNumber: 2 },
    }),
};
```

### 3. Build the Typed Registry

```typescript
import {
  createRegistration,
  makeCommandRegistry,
  makeCommandRegistryLayer,
} from '@codeforbreakfast/eventsourcing-commands';

// Create registrations
const registrations = [
  createRegistration(createUserCommand, createUserHandler),
  createRegistration(updateEmailCommand, updateEmailHandler),
];

// Create the registry
const registry = makeCommandRegistry(registrations);

// Or create as an Effect Layer
const registryLayer = makeCommandRegistryLayer(registrations);
```

### 4. Dispatch Commands

```typescript
import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';

const wireCommand: WireCommand = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser',
  payload: {
    name: 'John Doe',
    email: 'john@example.com',
  },
};

// The registry automatically validates the command against the appropriate schema
const result = await Effect.runPromise(registry.dispatch(wireCommand));

if (result._tag === 'Success') {
  console.log('Command executed successfully:', result.position);
} else {
  console.error('Command failed:', result.error);
}
```

## API Reference

### Core Types

#### WireCommand

Wire commands are used for transport/serialization (APIs, message queues, etc.):

```typescript
interface WireCommand {
  readonly id: string;
  readonly target: string; // Usually the aggregate ID
  readonly name: string; // Command name
  readonly payload: unknown; // Unvalidated payload
}
```

#### DomainCommand

Domain commands are the validated internal representation:

```typescript
interface DomainCommand<TPayload = unknown> {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: TPayload; // Validated payload
}
```

#### CommandResult

All command processing results follow this discriminated union:

```typescript
type CommandResult =
  | { _tag: 'Success'; position: EventStreamPosition }
  | { _tag: 'Failure'; error: CommandError };
```

### Command Definition API

#### `defineCommand(name, payloadSchema)`

Creates a strongly typed command definition that pairs a command name with its payload schema:

```typescript
import { Schema } from 'effect';
import { defineCommand } from '@codeforbreakfast/eventsourcing-commands';

const userCommand = defineCommand(
  'CreateUser',
  Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  })
);
```

#### `buildCommandSchema(commands)`

Builds a discriminated union schema from multiple command definitions. This creates an exhaustive schema that validates any registered command:

```typescript
import { buildCommandSchema } from '@codeforbreakfast/eventsourcing-commands';

const commands = [createUserCommand, updateEmailCommand];
const exhaustiveSchema = buildCommandSchema(commands);
```

### Registry API

#### `createRegistration(command, handler)`

Creates a registration that pairs a command definition with its handler:

```typescript
import { createRegistration } from '@codeforbreakfast/eventsourcing-commands';

const registration = createRegistration(createUserCommand, createUserHandler);
```

#### `makeCommandRegistry(registrations)`

Creates a command registry that validates and dispatches commands. Features:

- **Exhaustive validation**: All registered commands are validated upfront
- **Duplicate detection**: Compile-time detection of duplicate command names
- **Type safety**: Full TypeScript inference throughout the dispatch pipeline

```typescript
import { makeCommandRegistry } from '@codeforbreakfast/eventsourcing-commands';

const registry = makeCommandRegistry([
  createRegistration(createUserCommand, createUserHandler),
  createRegistration(updateEmailCommand, updateEmailHandler),
]);
```

#### `makeCommandRegistryLayer(registrations)`

Creates an Effect Layer containing the command registry:

```typescript
import {
  makeCommandRegistryLayer,
  CommandRegistryService,
} from '@codeforbreakfast/eventsourcing-commands';

const layer = makeCommandRegistryLayer(registrations);

// Use in your Effect program
const program = Effect.gen(function* () {
  const registry = yield* CommandRegistryService;
  return yield* registry.dispatch(wireCommand);
}).pipe(Effect.provide(layer));
```

## Key Benefits

### Compile-Time Safety

The typed registry system provides several compile-time guarantees:

- **No duplicate commands**: Each command name can only be registered once
- **Schema consistency**: Each command name maps to exactly one payload schema
- **Type inference**: Full TypeScript support throughout the dispatch pipeline

### Runtime Validation

- **Exhaustive validation**: Commands are validated against a discriminated union of all registered schemas
- **Early failure**: Invalid commands fail fast with detailed error messages
- **No runtime lookups**: All validation happens upfront

### Example Error Handling

```typescript
const result = await Effect.runPromise(registry.dispatch(wireCommand));

switch (result._tag) {
  case 'Success':
    console.log('Command processed:', result.position);
    break;

  case 'Failure':
    switch (result.error._tag) {
      case 'ValidationError':
        console.error('Invalid payload:', result.error.validationErrors);
        break;

      case 'HandlerNotFound':
        console.error('Unknown command:', result.error.commandName);
        console.log('Available commands:', result.error.availableHandlers);
        break;

      case 'ExecutionError':
        console.error('Handler failed:', result.error.message);
        break;

      default:
        console.error('Unknown error:', result.error);
    }
}
```

## Architecture

This package sits between the domain layer (aggregates) and infrastructure layers (protocols, transports):

- **Wire Layer** → External APIs use `WireCommand` for transport
- **Validation Layer** → Registry validates and transforms to `DomainCommand`
- **Domain Layer** → Handlers process validated `DomainCommand`s
- **Result Layer** → Standardized `CommandResult` responses

## Related Packages

- `@codeforbreakfast/eventsourcing-store` - Event storage and streaming
- `@codeforbreakfast/eventsourcing-aggregates` - Domain aggregate patterns
- `@codeforbreakfast/eventsourcing-protocol` - Protocol implementation
