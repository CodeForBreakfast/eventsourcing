/**
 * Multi-Layer Command Architecture Examples
 *
 * This demonstrates the three command execution patterns and when to use each:
 * 1. Wire Commands: External/API commands requiring validation
 * 2. Local Commands: Internal commands with compile-time type safety
 * 3. Direct Aggregate Functions: When command patterns add unnecessary overhead
 */

import { Effect, Schema, pipe, Layer } from 'effect';
import {
  WireCommand,
  LocalCommand,
  localCommand,
  DomainCommand,
  CommandHandler,
  AggregateCommands,
  CommandResult,
} from './commands';
import {
  registerCommand,
  dispatchCommand,
  dispatchLocalCommand,
  CommandRegistryLive,
} from './command-registry';

// ============================================================================
// Example Domain: User Management
// ============================================================================

// Domain types
interface User {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'inactive';
}

// Events
interface UserCreatedEvent {
  type: 'UserCreated';
  userId: string;
  email: string;
  name: string;
}

interface UserEmailUpdatedEvent {
  type: 'UserEmailUpdated';
  userId: string;
  oldEmail: string;
  newEmail: string;
}

interface UserDeactivatedEvent {
  type: 'UserDeactivated';
  userId: string;
  reason: string;
}

type UserEvent = UserCreatedEvent | UserEmailUpdatedEvent | UserDeactivatedEvent;

// Domain errors
class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}

class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User with ID ${userId} not found`);
  }
}

// ============================================================================
// Pattern 1: Wire Commands (External/API Operations)
// ============================================================================

// Schema definitions with validation
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
});

const UpdateUserEmailPayload = Schema.Struct({
  newEmail: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({ description: 'New email address' })
  ),
});

const DeactivateUserPayload = Schema.Struct({
  reason: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(500),
    Schema.annotations({ description: 'Reason for deactivation' })
  ),
});

// Command handlers for wire commands
const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        console.log(`[WIRE] Creating user: ${command.payload.email}`);

        // Full validation, business rules, persistence, etc.
        // This is where you'd:
        // 1. Check if user already exists
        // 2. Validate business rules
        // 3. Generate events
        // 4. Persist to event store
        // 5. Publish domain events

        return {
          _tag: 'Success' as const,
          position: { streamId: `user-${command.target}`, eventNumber: 1 },
        };
      })
    ),
};

const updateUserEmailHandler: CommandHandler<DomainCommand<typeof UpdateUserEmailPayload.Type>> = {
  handle: (command) =>
    pipe(
      Effect.sync(() => {
        console.log(`[WIRE] Updating email for user: ${command.target}`);

        return {
          _tag: 'Success' as const,
          position: { streamId: `user-${command.target}`, eventNumber: 2 },
        };
      })
    ),
};

// Setup wire command handlers
export const setupWireCommands = () =>
  pipe(
    Effect.all([
      registerCommand('CreateUser', CreateUserPayload, createUserHandler),
      registerCommand('UpdateUserEmail', UpdateUserEmailPayload, updateUserEmailHandler),
    ]),
    Effect.asVoid
  );

// Usage: External API endpoint
export const handleCreateUserRequest = (requestData: unknown) => {
  // This comes from HTTP request, WebSocket message, etc.
  const wireCommand: WireCommand = {
    id: crypto.randomUUID(),
    target: crypto.randomUUID(), // New user ID
    name: 'CreateUser',
    payload: requestData, // Unknown data from external source
  };

  // Full validation and processing pipeline
  return pipe(
    dispatchCommand(wireCommand),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Success') {
          console.log('✅ User created via API');
        } else {
          console.error('❌ User creation failed:', result.error);
        }
      })
    )
  );
};

// ============================================================================
// Pattern 2: Local Commands (Internal Operations)
// ============================================================================

// Type-safe payload types (no schemas needed)
interface CreateUserLocalPayload {
  email: string;
  name: string;
}

interface UpdateUserEmailLocalPayload {
  newEmail: string;
}

// Usage: Internal service communication
export const createUserInternally = (userData: CreateUserLocalPayload, userId: string) => {
  // Compile-time type safety, no runtime validation overhead
  const command = localCommand(crypto.randomUUID(), userId, 'CreateUser', userData);

  return pipe(
    dispatchLocalCommand(command),
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result._tag === 'Success') {
          console.log('✅ User created internally');
        } else {
          console.error('❌ Internal user creation failed:', result.error);
        }
      })
    )
  );
};

// Usage: Background job processing
export const processBulkUserCreation = (users: CreateUserLocalPayload[]) =>
  pipe(
    users,
    Effect.forEach((userData) => createUserInternally(userData, crypto.randomUUID())),
    Effect.tap((results) =>
      Effect.sync(() => {
        const successCount = results.filter((r) => r._tag === 'Success').length;
        console.log(`✅ Bulk created ${successCount}/${results.length} users`);
      })
    )
  );

// ============================================================================
// Pattern 3: Direct Aggregate Functions (Maximum Performance)
// ============================================================================

// Direct aggregate commands - no command layer overhead
const userAggregateCommands: AggregateCommands<UserEvent> = {
  createUser: (
    email: string,
    name: string
  ): Effect.Effect<UserEvent[], UserAlreadyExistsError, never> =>
    pipe(
      Effect.sync(() => {
        console.log(`[DIRECT] Creating user: ${email}`);

        // Direct business logic execution
        // Fastest path - no command validation, no registry lookup
        const event: UserCreatedEvent = {
          type: 'UserCreated',
          userId: crypto.randomUUID(),
          email,
          name,
        };

        return [event];
      })
    ),

  updateEmail: (
    userId: string,
    oldEmail: string,
    newEmail: string
  ): Effect.Effect<UserEvent[], UserNotFoundError, never> =>
    pipe(
      Effect.sync(() => {
        console.log(`[DIRECT] Updating email for user: ${userId}`);

        const event: UserEmailUpdatedEvent = {
          type: 'UserEmailUpdated',
          userId,
          oldEmail,
          newEmail,
        };

        return [event];
      })
    ),

  deactivate: (
    userId: string,
    reason: string
  ): Effect.Effect<UserEvent[], UserNotFoundError, never> =>
    pipe(
      Effect.sync(() => {
        console.log(`[DIRECT] Deactivating user: ${userId}`);

        const event: UserDeactivatedEvent = {
          type: 'UserDeactivated',
          userId,
          reason,
        };

        return [event];
      })
    ),
};

// Usage: High-performance operations
export const createUserDirect = (email: string, name: string) =>
  pipe(
    userAggregateCommands.createUser(email, name),
    Effect.tap((events) =>
      Effect.sync(() => {
        console.log(`✅ Generated ${events.length} events directly`);
      })
    )
  );

// Usage: Complex workflows combining multiple aggregates
export const complexUserWorkflow = (email: string, name: string) =>
  pipe(
    // Step 1: Create user directly
    userAggregateCommands.createUser(email, name),

    // Step 2: Could call other aggregates directly
    Effect.flatMap((userEvents) =>
      pipe(
        // Maybe call ProfileAggregate.commands.createProfile(...)
        // Maybe call NotificationAggregate.commands.sendWelcome(...)
        Effect.succeed(userEvents)
      )
    ),

    // Step 3: Commit all events in a single transaction
    Effect.tap((events) =>
      Effect.sync(() => {
        console.log(`✅ Complex workflow completed with ${events.length} events`);
        // Here you'd commit all events to the event store
      })
    )
  );

// ============================================================================
// Usage Pattern Decision Guide
// ============================================================================

export const demonstrateUsagePatterns = () =>
  pipe(
    Effect.all([
      // Pattern 1: External API call (unknown data, needs validation)
      handleCreateUserRequest({
        email: 'api-user@example.com',
        name: 'API User',
      }),

      // Pattern 2: Internal service call (trusted data, type-safe)
      createUserInternally(
        { email: 'internal-user@example.com', name: 'Internal User' },
        'user-123'
      ),

      // Pattern 3: Direct aggregate call (maximum performance)
      createUserDirect('direct-user@example.com', 'Direct User'),

      // Complex workflow using direct calls
      complexUserWorkflow('workflow-user@example.com', 'Workflow User'),
    ]),

    Effect.tap(() =>
      Effect.sync(() => {
        console.log('\n🎯 Decision Guide:');
        console.log('• Wire Commands: External APIs, unknown data, need validation');
        console.log('• Local Commands: Internal services, trusted data, audit trails');
        console.log('• Direct Aggregate: High-performance, complex workflows, maximum control');
      })
    )
  );

// ============================================================================
// Example Application Layer
// ============================================================================

export const ExampleApp = pipe(
  Layer.mergeAll(
    CommandRegistryLive
    // Add other layers like EventStore, etc.
  ),
  Layer.tap(() => setupWireCommands())
);

// Run all examples
export const runExamples = () => pipe(demonstrateUsagePatterns(), Effect.provide(ExampleApp));
