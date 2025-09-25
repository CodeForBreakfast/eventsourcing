# @codeforbreakfast/eventsourcing-commands

CQRS command types and schemas for event sourcing. This package provides core command handling abstractions with type-safe command and result definitions.

## Overview

This package contains the fundamental CQRS (Command Query Responsibility Segregation) types that bridge the gap between user intentions and domain events. Commands represent requests to change system state, while command results indicate the outcome of processing those commands.

## Installation

```bash
npm install @codeforbreakfast/eventsourcing-commands
```

## Key Concepts

- **Commands**: Represent user intent to change aggregate state
- **Command Results**: Indicate success/failure of command processing
- **Type Safety**: Full TypeScript support with Effect schemas

## API Reference

### Command

Represents a request to change system state:

```typescript
import { Command } from '@codeforbreakfast/eventsourcing-commands';

const createUserCommand: Command = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser',
  payload: {
    name: 'John Doe',
    email: 'john@example.com',
  },
};
```

### CommandResult

Represents the outcome of command processing:

```typescript
import { CommandResult } from '@codeforbreakfast/eventsourcing-commands';

// Success result
const success: CommandResult = {
  _tag: 'Success',
  position: { streamId: 'user-456', eventNumber: 1 },
};

// Failure result
const failure: CommandResult = {
  _tag: 'Failure',
  error: 'User already exists',
};
```

## Architecture

This package sits between the domain layer (aggregates) and infrastructure layers (protocols, transports):

- **Domain Layer** → Uses commands to represent business intentions
- **Application Layer** → Processes commands and returns results
- **Infrastructure Layer** → Transports commands over various protocols

## Related Packages

- `@codeforbreakfast/eventsourcing-store` - Event storage and streaming
- `@codeforbreakfast/eventsourcing-aggregates` - Domain aggregate patterns
- `@codeforbreakfast/eventsourcing-protocol-default` - Protocol implementations
