/**
 * Example demonstrating type-safe command registry usage
 *
 * This file shows how to leverage TypeScript's type system and Effect Schema
 * to create exhaustive command name validation at build time.
 */

import { Schema, Effect, pipe } from 'effect';
import { WireCommand, DomainCommand, CommandHandler } from './commands';
import {
  buildCommandRegistrations,
  createCommandRegistration,
  createTypedCommandRegistryService,
  createWireCommandSchema,
  makeTypedCommandRegistry,
} from './command-registry';

// ============================================================================
// Step 1: Define your command payload schemas
// ============================================================================

const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.pipe(Schema.minLength(1)),
});

const UpdateEmailPayload = Schema.Struct({
  newEmail: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
});

const DeleteUserPayload = Schema.Struct({
  reason: Schema.String.pipe(Schema.minLength(1)),
});

// ============================================================================
// Step 2: Define your command handlers
// ============================================================================

const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target as any, eventNumber: 1 },
    }),
};

const updateEmailHandler: CommandHandler<DomainCommand<typeof UpdateEmailPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target as any, eventNumber: 2 },
    }),
};

const deleteUserHandler: CommandHandler<DomainCommand<typeof DeleteUserPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: command.target as any, eventNumber: 3 },
    }),
};

// ============================================================================
// Step 3: Build your type-safe command registrations
// ============================================================================

export const userCommandRegistrations = buildCommandRegistrations({
  CreateUser: createCommandRegistration(CreateUserPayload, createUserHandler),
  UpdateEmail: createCommandRegistration(UpdateEmailPayload, updateEmailHandler),
  DeleteUser: createCommandRegistration(DeleteUserPayload, deleteUserHandler),
});

// TypeScript now knows these are the ONLY valid command names:
// "CreateUser" | "UpdateEmail" | "DeleteUser"

// ============================================================================
// Step 4: Create type-safe service and utilities
// ============================================================================

// Create the typed service for this specific set of commands
export const UserCommandService =
  createTypedCommandRegistryService<typeof userCommandRegistrations>();

// Create wire command schema that ONLY accepts known command names
export const UserWireCommandSchema = createWireCommandSchema(userCommandRegistrations);

// Create the registry instance
export const userCommandRegistry = makeTypedCommandRegistry(userCommandRegistrations);

// ============================================================================
// Step 5: Usage examples showing compile-time safety
// ============================================================================

// ✅ This works - TypeScript knows "CreateUser" is valid
export const createUserCommand = {
  id: 'cmd-123',
  target: 'user-456',
  name: 'CreateUser' as const,
  payload: {
    email: 'john@example.com',
    name: 'John Doe',
  },
};

// ✅ This works - TypeScript knows "UpdateEmail" is valid
export const updateEmailCommand = {
  id: 'cmd-456',
  target: 'user-789',
  name: 'UpdateEmail' as const,
  payload: {
    newEmail: 'newemail@example.com',
  },
};

// ❌ This would cause a TypeScript error if uncommented:
// const invalidCommand = {
//   id: 'cmd-999',
//   target: 'user-123',
//   name: 'NonexistentCommand' as const, // ❌ Type error!
//   payload: {},
// };

// ============================================================================
// Step 6: Runtime validation examples
// ============================================================================

/**
 * Example: Validate wire command at runtime using generated schema
 */
export const validateWireCommand = (input: unknown) =>
  pipe(
    Schema.decodeUnknown(UserWireCommandSchema)(input),
    Effect.mapError(() => new Error('Invalid command'))
  );

/**
 * Example: Type-safe dispatch with compile-time guarantees
 */
export const dispatchTypedUserCommand = (
  command: Schema.Schema.Type<typeof UserWireCommandSchema>
) => userCommandRegistry.dispatch(command);

/**
 * Example: Parse and dispatch untyped command with runtime validation
 */
export const parseAndDispatchUserCommand = (wireCommand: WireCommand) =>
  userCommandRegistry.dispatchUntypedWire(wireCommand);

/**
 * Example: Using with Effect service layer
 */
export const userCommandLayer = UserCommandService.Live(userCommandRegistrations);

export const exampleProgram = Effect.gen(function* () {
  const service = yield* UserCommandService;

  // TypeScript enforces this command name is valid
  const result = yield* service.dispatch({
    id: 'cmd-example',
    target: 'user-example',
    name: 'DeleteUser', // ✅ Exhaustively checked by TypeScript
    payload: {
      reason: 'Account deactivation requested',
    },
  });

  return result;
});

// ============================================================================
// Type-level guarantees demonstrated
// ============================================================================

// This type represents ONLY the valid command names
type ValidUserCommands = keyof typeof userCommandRegistrations;
// Result: "CreateUser" | "UpdateEmail" | "DeleteUser"

// This demonstrates exhaustive checking - if you add a new command to the
// registrations, TypeScript will force you to handle it everywhere it's needed

// Schema automatically rejects unknown commands at runtime
// TypeScript prevents unknown commands at compile time
// Perfect combination of compile-time safety and runtime validation!
