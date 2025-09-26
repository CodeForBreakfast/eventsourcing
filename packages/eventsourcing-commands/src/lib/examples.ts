/**
 * Two-Tier Command Architecture Examples
 *
 * This demonstrates the proper usage patterns:
 * 1. Wire Commands - External transport layer with validation
 * 2. Aggregate Commands - Direct aggregate methods (via makeAggregateRoot)
 */

import { Effect, Schema, pipe } from 'effect';
import { DomainCommand, CommandHandler, WireCommand } from './commands';
import {
  createCommandRegistration,
  buildCommandRegistrations,
  makeCommandRegistryLayer,
  dispatchCommand,
} from './command-registry';

// ============================================================================
// Tier 1: Wire Commands for External APIs
// ============================================================================

// Define payload schemas with validation
const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({ description: 'Valid email address' })
  ),
  name: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(100),
    Schema.annotations({ description: 'User full name' })
  ),
  age: Schema.optional(
    Schema.Number.pipe(
      Schema.between(13, 120),
      Schema.annotations({ description: 'User age between 13 and 120' })
    )
  ),
});

// Wire command handler - validates and delegates to aggregate
const createUserWireHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        // Wire command handler:
        // 1. Validates incoming data (done by schema)
        // 2. Loads aggregate
        // 3. Calls aggregate.commands.createUser(payload)
        // 4. Returns result

        console.log(`Wire command: Creating user with email: ${command.payload.email}`);

        // In real implementation:
        // return pipe(
        //   UserAggregate.load(command.target),
        //   Effect.flatMap(aggregate =>
        //     aggregate.commands.createUser(command.payload)
        //   ),
        //   Effect.map(events => ({ _tag: 'Success', position: ... }))
        // );

        return {
          _tag: 'Success' as const,
          position: { streamId: 'user-123' as any, eventNumber: 1 },
        };
      })
    ),
};

export const wireCommandRegistrations = buildCommandRegistrations({
  CreateUser: createCommandRegistration(CreateUserPayload, createUserWireHandler),
});

const WireCommandRegistryLayer = makeCommandRegistryLayer(wireCommandRegistrations);

// ============================================================================
// Example: HTTP API Usage (Wire Commands)
// ============================================================================

export const httpApiExample = () => {
  // This is how wire commands are used from HTTP endpoints
  const wireCommand: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-123',
    name: 'CreateUser',
    payload: {
      email: 'alice@example.com',
      name: 'Alice Smith',
      age: 28,
    },
  };

  return pipe(
    dispatchCommand(wireCommand),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Success') {
          console.log(`HTTP API: User created at position: ${result.position.eventNumber}`);
        } else {
          console.error(`HTTP API: Command failed:`, result.error);
        }
      })
    ),
    Effect.provide(WireCommandRegistryLayer)
  );
};

// ============================================================================
// Tier 2: Direct Aggregate Commands (makeAggregateRoot pattern)
// ============================================================================

/**
 * This shows how aggregate commands work directly.
 * The existing makeAggregateRoot function already supports this pattern.
 *
 * Example of how it's used in practice:
 *
 * ```typescript
 * // Define aggregate command functions
 * const userCommands = {
 *   createUser: (userData: CreateUserData) =>
 *     pipe(
 *       validateUserData(userData),
 *       Effect.map(validData => [UserCreatedEvent.make(validData)])
 *     ),
 *
 *   updateEmail: (newEmail: string) =>
 *     pipe(
 *       validateEmail(newEmail),
 *       Effect.map(email => [UserEmailUpdatedEvent.make({ email })])
 *     ),
 * };
 *
 * // Create aggregate with commands
 * const UserAggregate = makeAggregateRoot(
 *   UserId,
 *   applyUserEvent,
 *   UserEventStoreTag,
 *   userCommands  // <- Commands are passed here
 * );
 *
 * // Usage - direct aggregate operations (internal services)
 * const createUserDirectly = pipe(
 *   UserAggregate.load('user-123'),
 *   Effect.flatMap(aggregate =>
 *     aggregate.commands.createUser({
 *       email: 'user@example.com',
 *       name: 'User Name'
 *     })
 *   ),
 *   Effect.flatMap(events =>
 *     UserAggregate.commit({
 *       id: 'user-123',
 *       eventNumber: aggregate.nextEventNumber,
 *       events: Chunk.fromIterable(events)
 *     })
 *   )
 * );
 * ```
 */

// ============================================================================
// Architecture Summary
// ============================================================================

/**
 * Two-Tier Architecture:
 *
 * 1. **Wire Commands** (This package)
 *    - External boundary (HTTP, WebSocket, message queues)
 *    - Schema validation with Effect/Schema
 *    - Unknown payload → validated domain payload
 *    - Command registry for routing
 *    - Type-safe error handling
 *
 * 2. **Aggregate Commands** (eventsourcing-aggregates package)
 *    - Direct aggregate methods via makeAggregateRoot
 *    - Compile-time type safety
 *    - Pure functions: payload → events
 *    - No serialization overhead
 *    - Maximum performance for internal operations
 *
 * **When to use which:**
 * - Wire Commands: External APIs, transport boundaries, untrusted input
 * - Aggregate Commands: Internal services, trusted operations, performance-critical paths
 *
 * **Integration:**
 * Wire command handlers typically load aggregates and call aggregate.commands.method()
 */

// ============================================================================
// Error Handling Example
// ============================================================================

export const errorHandlingExample = () => {
  const invalidCommand: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-456',
    name: 'CreateUser',
    payload: {
      email: 'invalid-email', // Validation failure
      name: '', // Too short
      age: 150, // Too old
    },
  };

  return pipe(
    dispatchCommand(invalidCommand),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Failure' && result.error._tag === 'ValidationError') {
          console.error('Wire command validation failed:', result.error.validationErrors);
        }
      })
    ),
    Effect.provide(WireCommandRegistryLayer)
  );
};

// ============================================================================
// Clean API Example
// ============================================================================

// Simple example showing the cleaned up API
export const simpleExample = () => {
  // Define a basic payload
  const MessagePayload = Schema.Struct({
    text: Schema.String.pipe(Schema.minLength(1)),
  });

  // Define a handler
  const messageHandler: CommandHandler<DomainCommand<typeof MessagePayload.Type>> = {
    handle: (command) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: command.target as any, eventNumber: 1 },
      }),
  };

  // Build registrations
  const registrations = buildCommandRegistrations({
    SendMessage: createCommandRegistration(MessagePayload, messageHandler),
  });

  // Create layer
  const messageLayer = makeCommandRegistryLayer(registrations);

  // Use it
  const sendMessage = (text: string) => {
    const wireCommand: WireCommand = {
      id: crypto.randomUUID(),
      target: 'chat-123',
      name: 'SendMessage',
      payload: { text },
    };

    return pipe(dispatchCommand(wireCommand), Effect.provide(messageLayer));
  };

  return { sendMessage };
};
