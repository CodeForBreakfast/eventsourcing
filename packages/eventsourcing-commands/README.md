# @codeforbreakfast/eventsourcing-commands

CQRS command types and schemas for event sourcing. This package provides core command handling abstractions with type-safe command and result definitions, featuring a strongly typed command registry system.

## Overview

This package contains the fundamental CQRS (Command Query Responsibility Segregation) types that bridge the gap between user intentions and domain events. Commands represent requests to change system state, while command results indicate the outcome of processing those commands.

The package features a **typed command registry** that ensures each command name is tied to exactly one payload schema, providing compile-time safety and exhaustive validation using Effect's pattern matching for comprehensive command handling.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-commands
```

## Key Concepts

- **Commands**: Represent user intent to change aggregate state
- **Command Results**: Indicate success/failure of command processing
- **Type Safety**: Full TypeScript support with Effect schemas
- **Pattern Matching**: Effect's exhaustive pattern matching for command handling
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

### 2. Create Command Matcher

```typescript
import { Effect, Match, pipe, Schema } from 'effect';
import {
  CommandFromDefinitions,
  makeCommandRegistry,
  CommandResult,
  CommandDefinition,
} from '@codeforbreakfast/eventsourcing-commands';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Declare commands from previous example
declare const createUserCommand: CommandDefinition<'CreateUser', { name: string; email: string }>;
declare const updateEmailCommand: CommandDefinition<'UpdateEmail', { newEmail: string }>;

// Define your command array
const commands = [createUserCommand, updateEmailCommand] as const;

// Extract the command union type
type Commands = CommandFromDefinitions<typeof commands>;

// Create a matcher using Effect's pattern matching
const commandMatcher = (command: Commands): Effect.Effect<CommandResult, never, never> =>
  pipe(
    Match.value(command),
    Match.when({ name: 'CreateUser' }, (cmd) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: cmd.target, eventNumber: 1 } as EventStreamPosition,
      })
    ),
    Match.when({ name: 'UpdateEmail' }, (cmd) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: cmd.target, eventNumber: 2 } as EventStreamPosition,
      })
    ),
    Match.exhaustive // TypeScript ensures all commands are handled!
  );
```

### 3. Build the Typed Registry

```typescript
import {
  makeCommandRegistry,
  makeCommandRegistryLayer,
  CommandFromDefinitions,
  CommandDefinition,
  CommandResult,
} from '@codeforbreakfast/eventsourcing-commands';
import { Effect } from 'effect';

// Declare from previous examples
declare const commands: readonly [
  CommandDefinition<'CreateUser', { name: string; email: string }>,
  CommandDefinition<'UpdateEmail', { newEmail: string }>,
];
declare const commandMatcher: (
  command: CommandFromDefinitions<typeof commands>
) => Effect.Effect<CommandResult, never, never>;

// Create the registry with commands and matcher
const registry = makeCommandRegistry(commands, commandMatcher);

// Or create as an Effect Layer
const registryLayer = makeCommandRegistryLayer(commands, commandMatcher);
```

### 4. Dispatch Commands

```typescript
import {
  WireCommand,
  CommandRegistry,
  CommandResult,
} from '@codeforbreakfast/eventsourcing-commands';
import { Effect, Context } from 'effect';

// Declare registry from previous example
declare const registry: Context.Tag.Service<typeof CommandRegistry>;

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
const result: CommandResult = await Effect.runPromise(registry.dispatch(wireCommand));

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
interface DomainCommand<TPayload> {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: TPayload; // Validated payload
}
```

#### CommandResult

All command processing results follow this discriminated union:

```typescript
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

type CommandResult =
  | { _tag: 'Success'; position: EventStreamPosition }
  | {
      _tag: 'Failure';
      error: {
        _tag:
          | 'ValidationError'
          | 'HandlerNotFound'
          | 'ExecutionError'
          | 'AggregateNotFound'
          | 'ConcurrencyConflict'
          | 'UnknownError';
        commandId: string;
        [key: string]: unknown;
      };
    };
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
import { buildCommandSchema, CommandDefinition } from '@codeforbreakfast/eventsourcing-commands';
import { Schema } from 'effect';

// Declare commands from previous examples
declare const createUserCommand: CommandDefinition<'CreateUser', { name: string; email: string }>;
declare const updateEmailCommand: CommandDefinition<'UpdateEmail', { newEmail: string }>;

const commands = [createUserCommand, updateEmailCommand];
const exhaustiveSchema = buildCommandSchema(commands);
```

### Registry API

#### `makeCommandRegistry(commands, matcher)`

Creates a command registry using Effect's pattern matching. Features:

- **Exhaustive validation**: All commands are validated against discriminated union schema
- **Compile-time safety**: TypeScript ensures all command types are handled in matcher
- **Pattern matching**: Uses Effect's `Match.exhaustive` for comprehensive command handling
- **Type inference**: Full TypeScript support throughout the dispatch pipeline

```typescript
import { Match, pipe, Effect } from 'effect';
import {
  makeCommandRegistry,
  CommandFromDefinitions,
  CommandResult,
  CommandDefinition,
} from '@codeforbreakfast/eventsourcing-commands';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Declare commands from previous examples
declare const createUserCommand: CommandDefinition<'CreateUser', { name: string; email: string }>;
declare const updateEmailCommand: CommandDefinition<'UpdateEmail', { newEmail: string }>;

const commands = [createUserCommand, updateEmailCommand] as const;
type Commands = CommandFromDefinitions<typeof commands>;

const commandMatcher = (command: Commands): Effect.Effect<CommandResult, never, never> =>
  pipe(
    Match.value(command),
    Match.when({ name: 'CreateUser' }, (cmd) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: cmd.target, eventNumber: 1 } as EventStreamPosition,
      })
    ),
    Match.when({ name: 'UpdateEmail' }, (cmd) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: cmd.target, eventNumber: 2 } as EventStreamPosition,
      })
    ),
    Match.exhaustive // Compile-time exhaustiveness checking
  );

const registry = makeCommandRegistry(commands, commandMatcher);
```

#### `makeCommandRegistryLayer(commands, matcher)`

Creates an Effect Layer containing the command registry:

```typescript
import { Effect, pipe } from 'effect';
import {
  makeCommandRegistryLayer,
  CommandRegistry,
  CommandFromDefinitions,
  CommandDefinition,
  CommandResult,
  WireCommand,
} from '@codeforbreakfast/eventsourcing-commands';

// Declare from previous examples
declare const commands: readonly [
  CommandDefinition<'CreateUser', { name: string; email: string }>,
  CommandDefinition<'UpdateEmail', { newEmail: string }>,
];
declare const commandMatcher: (
  command: CommandFromDefinitions<typeof commands>
) => Effect.Effect<CommandResult, never, never>;
declare const wireCommand: WireCommand;

const layer = makeCommandRegistryLayer(commands, commandMatcher);

// Use in your Effect program
const program = pipe(
  CommandRegistry,
  Effect.flatMap((registry) => registry.dispatch(wireCommand)),
  Effect.provide(layer)
);
```

## Key Benefits

### Compile-Time Safety

The matcher-based registry system provides several compile-time guarantees:

- **Exhaustive command handling**: `Match.exhaustive` ensures all command types are handled
- **Schema consistency**: Each command name maps to exactly one payload schema
- **Type inference**: Full TypeScript support with exact command types in each match arm
- **No runtime lookups**: Pattern matching eliminates the need for handler maps

### Runtime Validation

- **Exhaustive validation**: Commands are validated against a discriminated union of all registered schemas
- **Early failure**: Invalid commands fail fast with detailed error messages
- **Pattern matching**: Effect's matchers provide functional command dispatch
- **Type-safe handling**: Each match arm receives the exact command type

### Example Error Handling

```typescript
import { Effect, Context } from 'effect';
import {
  WireCommand,
  CommandRegistry,
  CommandResult,
} from '@codeforbreakfast/eventsourcing-commands';

// Declare from previous examples
declare const registry: Context.Tag.Service<typeof CommandRegistry>;
declare const wireCommand: WireCommand;

const result: CommandResult = await Effect.runPromise(registry.dispatch(wireCommand));

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
