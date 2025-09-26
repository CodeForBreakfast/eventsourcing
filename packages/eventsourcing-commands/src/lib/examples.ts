/**
 * Example usage patterns for type-safe commands
 * This shows how to properly define and handle commands with full type safety
 */

import { Effect, Schema, pipe } from 'effect';
import {
  createCommandSchema,
  DomainCommand,
  CommandResult,
  CommandHandler,
  WireCommand,
} from './commands';
import { registerCommand, dispatchCommand } from './command-registry';

// ============================================================================
// Example 1: Simple User Management Commands
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

const UpdateUserEmailPayload = Schema.Struct({
  newEmail: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({ description: 'New email address' })
  ),
});

// Create type-safe command schemas
const CreateUserCommand = createCommandSchema('CreateUser', CreateUserPayload);
const UpdateUserEmailCommand = createCommandSchema('UpdateUserEmail', UpdateUserEmailPayload);

// Extract types for use in handlers
type CreateUserCommand = typeof CreateUserCommand.Type;
type UpdateUserEmailCommand = typeof UpdateUserEmailCommand.Type;

// ============================================================================
// Example 2: Command Handlers with Domain Logic
// ============================================================================

// Mock event stream position for examples
const mockPosition = { streamId: 'user-123' as any, eventNumber: 1 };

const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        // Domain logic here - validate business rules, check uniqueness, etc.
        console.log(`Creating user with email: ${command.payload.email}`);

        // In real implementation, this would:
        // 1. Load aggregate root
        // 2. Execute domain logic
        // 3. Generate events
        // 4. Commit to event store

        return {
          _tag: 'Success' as const,
          position: mockPosition,
        };
      })
    ),
};

const updateUserEmailHandler: CommandHandler<DomainCommand<typeof UpdateUserEmailPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        // Domain logic for updating email
        console.log(`Updating email to: ${command.payload.newEmail} for user: ${command.target}`);

        return {
          _tag: 'Success' as const,
          position: mockPosition,
        };
      })
    ),
};

// ============================================================================
// Example 3: Command Registration and Usage
// ============================================================================

export const setupUserCommands = () =>
  pipe(
    Effect.all([
      registerCommand('CreateUser', CreateUserPayload, createUserHandler),
      registerCommand('UpdateUserEmail', UpdateUserEmailPayload, updateUserEmailHandler),
    ]),
    Effect.asVoid
  );

// ============================================================================
// Example 4: Type-Safe Command Creation and Dispatch
// ============================================================================

export const createUserExample = () => {
  // Creating a wire command (e.g., from HTTP request, WebSocket message)
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

  // Dispatch the command - validation happens automatically
  return pipe(
    dispatchCommand(wireCommand),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Success') {
          console.log(`User created successfully at position: ${result.position.eventNumber}`);
        } else {
          console.error(`Command failed:`, result.error);
        }
      })
    )
  );
};

// ============================================================================
// Example 5: Error Handling Showcase
// ============================================================================

export const errorHandlingExample = () => {
  const invalidCommand: WireCommand = {
    id: crypto.randomUUID(),
    target: 'user-456',
    name: 'CreateUser',
    payload: {
      email: 'invalid-email', // This will fail validation
      name: '', // This will fail validation (too short)
      age: 150, // This will fail validation (too old)
    },
  };

  return pipe(
    dispatchCommand(invalidCommand),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Failure') {
          switch (result.error._tag) {
            case 'ValidationError':
              console.error('Validation failed:', result.error.validationErrors);
              break;
            case 'HandlerNotFound':
              console.error('No handler for command:', result.error.commandName);
              break;
            case 'ExecutionError':
              console.error('Command execution failed:', result.error.message);
              break;
            default:
              console.error('Unknown error:', result.error);
          }
        }
      })
    )
  );
};

// ============================================================================
// Example 6: Advanced Command with Complex Payload
// ============================================================================

const BulkImportUsersPayload = Schema.Struct({
  users: Schema.Array(
    Schema.Struct({
      email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
      name: Schema.String.pipe(Schema.minLength(1)),
      metadata: Schema.optional(
        Schema.Record(Schema.String, Schema.Union(Schema.String, Schema.Number, Schema.Boolean))
      ),
    })
  ).pipe(
    Schema.minItems(1),
    Schema.maxItems(100),
    Schema.annotations({ description: 'Batch of 1-100 users to import' })
  ),
  importSource: Schema.String.pipe(
    Schema.annotations({ description: 'Source system for the import' })
  ),
  dryRun: Schema.optional(
    Schema.Boolean.pipe(
      Schema.annotations({ description: 'Whether to perform a dry run without actual changes' })
    )
  ),
});

const bulkImportHandler: CommandHandler<DomainCommand<typeof BulkImportUsersPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        console.log(
          `Bulk importing ${command.payload.users.length} users from ${command.payload.importSource}`
        );

        if (command.payload.dryRun) {
          console.log('DRY RUN - No actual changes made');
        }

        // Complex domain logic for bulk operations
        // - Validate each user doesn't already exist
        // - Check system limits
        // - Generate events for each user
        // - Handle partial failures

        return {
          _tag: 'Success' as const,
          position: mockPosition,
        };
      })
    ),
};

export const setupBulkCommands = () =>
  registerCommand('BulkImportUsers', BulkImportUsersPayload, bulkImportHandler);

// ============================================================================
// Example 7: Command with Business Rule Validation
// ============================================================================

const TransferMoneyPayload = Schema.Struct({
  fromAccountId: Schema.String.pipe(Schema.uuid()),
  toAccountId: Schema.String.pipe(Schema.uuid()),
  amount: Schema.Number.pipe(
    Schema.positive(),
    Schema.annotations({ description: 'Amount to transfer (must be positive)' })
  ),
  currency: Schema.Literal('USD', 'EUR', 'GBP'),
  reference: Schema.optional(
    Schema.String.pipe(
      Schema.maxLength(200),
      Schema.annotations({ description: 'Optional reference for the transfer' })
    )
  ),
});

const transferMoneyHandler: CommandHandler<DomainCommand<typeof TransferMoneyPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        // Complex business validation that can't be expressed in schema
        if (command.payload.fromAccountId === command.payload.toAccountId) {
          throw new Error('Cannot transfer money to the same account');
        }

        if (command.payload.amount < 0.01) {
          throw new Error('Minimum transfer amount is 0.01');
        }

        console.log(
          `Transferring ${command.payload.amount} ${command.payload.currency} ` +
            `from ${command.payload.fromAccountId} to ${command.payload.toAccountId}`
        );

        return {
          _tag: 'Success' as const,
          position: mockPosition,
        };
      })
    ),
};

export const setupFinancialCommands = () =>
  registerCommand('TransferMoney', TransferMoneyPayload, transferMoneyHandler);
