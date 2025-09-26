import { Schema, Data, pipe, Effect } from 'effect';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Multi-Layer Command Architecture
// ============================================================================
//
// This architecture supports three patterns:
// 1. Wire Commands: External/API commands requiring validation and serialization
// 2. Domain Commands: Internal commands with compile-time type safety
// 3. Direct Aggregate Functions: When command patterns add unnecessary overhead
//
// Choose the right abstraction level for your use case:
// - HTTP/WebSocket APIs → WireCommand → DomainCommand → Aggregate
// - Internal services → DomainCommand → Aggregate
// - Simple operations → DirectAggregate functions
// - Complex workflows → Combination of all three

/**
 * Base command interface - what all domain commands must implement
 * This is the type-safe internal representation
 */
export interface DomainCommand<TPayload = unknown> {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: TPayload;
}

/**
 * Local command - compile-time safe, no serialization overhead
 * Use for trusted internal operations within the same process
 *
 * @example
 * ```typescript
 * const command: LocalCommand<CreateUserPayload> = {
 *   id: crypto.randomUUID(),
 *   target: 'user-123',
 *   name: 'CreateUser',
 *   payload: { email: 'user@example.com', name: 'User' }
 * };
 *
 * // Direct dispatch - no validation overhead
 * await dispatchLocalCommand(command);
 * ```
 */
export interface LocalCommand<TPayload> extends DomainCommand<TPayload> {
  readonly _brand: 'LocalCommand';
}

/**
 * Creates a local command with compile-time type safety
 * No runtime validation - use for trusted internal operations
 */
export const localCommand = <TPayload>(
  id: string,
  target: string,
  name: string,
  payload: TPayload
): LocalCommand<TPayload> => ({
  id,
  target,
  name,
  payload,
  _brand: 'LocalCommand',
});

/**
 * Wire command schema - for transport/serialization only
 * Uses Schema.Unknown for payload since it must handle any serializable data
 */
export const WireCommand = Schema.Struct({
  id: Schema.String,
  target: Schema.String,
  name: Schema.String,
  payload: Schema.Unknown,
});
export type WireCommand = typeof WireCommand.Type;

/**
 * Legacy Command export for backward compatibility
 * @deprecated Use WireCommand for transport, DomainCommand for domain logic
 */
export type Command = WireCommand;

// ============================================================================
// Domain Command Errors
// ============================================================================

export class CommandValidationError extends Data.TaggedError('CommandValidationError')<{
  readonly commandId: string;
  readonly commandName: string;
  readonly validationErrors: ReadonlyArray<string>;
}> {}

export class CommandHandlerNotFoundError extends Data.TaggedError('CommandHandlerNotFoundError')<{
  readonly commandId: string;
  readonly commandName: string;
  readonly availableHandlers: ReadonlyArray<string>;
}> {}

export class CommandExecutionError extends Data.TaggedError('CommandExecutionError')<{
  readonly commandId: string;
  readonly commandName: string;
  readonly cause: unknown;
}> {}

export class AggregateNotFoundError extends Data.TaggedError('AggregateNotFoundError')<{
  readonly commandId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
}> {}

export class ConcurrencyConflictError extends Data.TaggedError('ConcurrencyConflictError')<{
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;
}> {}

// ============================================================================
// Command Results with Proper Error Types
// ============================================================================

export const CommandSuccess = Schema.Struct({
  _tag: Schema.Literal('Success'),
  position: EventStreamPosition,
});
export type CommandSuccess = typeof CommandSuccess.Type;

export const CommandFailure = Schema.Struct({
  _tag: Schema.Literal('Failure'),
  error: Schema.Union(
    Schema.Struct({
      _tag: Schema.Literal('ValidationError'),
      commandId: Schema.String,
      commandName: Schema.String,
      validationErrors: Schema.Array(Schema.String),
    }),
    Schema.Struct({
      _tag: Schema.Literal('HandlerNotFound'),
      commandId: Schema.String,
      commandName: Schema.String,
      availableHandlers: Schema.Array(Schema.String),
    }),
    Schema.Struct({
      _tag: Schema.Literal('ExecutionError'),
      commandId: Schema.String,
      commandName: Schema.String,
      message: Schema.String,
    }),
    Schema.Struct({
      _tag: Schema.Literal('AggregateNotFound'),
      commandId: Schema.String,
      aggregateId: Schema.String,
      aggregateType: Schema.String,
    }),
    Schema.Struct({
      _tag: Schema.Literal('ConcurrencyConflict'),
      commandId: Schema.String,
      expectedVersion: Schema.Number,
      actualVersion: Schema.Number,
    }),
    Schema.Struct({
      _tag: Schema.Literal('UnknownError'),
      commandId: Schema.String,
      message: Schema.String,
    })
  ),
});
export type CommandFailure = typeof CommandFailure.Type;

/**
 * Improved command result with proper typed errors
 */
export const CommandResult = Schema.Union(CommandSuccess, CommandFailure);
export type CommandResult = typeof CommandResult.Type;

// ============================================================================
// Type-Safe Command Definition Helpers
// ============================================================================

/**
 * Creates a type-safe command schema with validation
 * Use this to define your domain commands with proper payload schemas
 *
 * @example
 * ```typescript
 * const CreateUserCommand = createCommandSchema(
 *   'CreateUser',
 *   Schema.Struct({
 *     email: Schema.String.pipe(Schema.pattern(/\S+@\S+\.\S+/)),
 *     name: Schema.String.pipe(Schema.minLength(1)),
 *     age: Schema.optional(Schema.Number.pipe(Schema.between(0, 120)))
 *   })
 * );
 *
 * type CreateUserCommand = typeof CreateUserCommand.Type;
 * ```
 */
export const createCommandSchema = <TName extends string, TPayload, TPayloadInput>(
  name: TName,
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>
) =>
  Schema.Struct({
    id: Schema.String,
    target: Schema.String,
    name: Schema.Literal(name),
    payload: payloadSchema,
  });

/**
 * Validates and transforms a wire command into a domain command
 * This is where the Schema/Domain boundary enforcement happens
 */
export const validateCommand =
  <TPayload, TPayloadInput>(payloadSchema: Schema.Schema<TPayload, TPayloadInput>) =>
  (wireCommand: WireCommand) =>
    pipe(
      Schema.decodeUnknown(payloadSchema)(wireCommand.payload),
      Effect.mapError(
        (parseError) =>
          new CommandValidationError({
            commandId: wireCommand.id,
            commandName: wireCommand.name,
            validationErrors: [parseError.message || 'Payload validation failed'],
          })
      ),
      Effect.map(
        (validatedPayload): DomainCommand<TPayload> => ({
          id: wireCommand.id,
          target: wireCommand.target,
          name: wireCommand.name,
          payload: validatedPayload,
        })
      )
    );

// ============================================================================
// Command Handler Type Definitions
// ============================================================================

/**
 * Command handler function type
 * Pure function that takes a validated domain command and returns an Effect
 */
export interface CommandHandler<
  TCommand extends DomainCommand,
  TError = never,
  TResult = CommandResult,
> {
  readonly handle: (command: TCommand) => Effect.Effect<TResult, TError, never>;
}

// ============================================================================
// Command Registry Types
// ============================================================================

/**
 * Command registry for mapping command names to handlers with validation
 * This provides type-safe command dispatch
 */
export interface CommandRegistry {
  readonly register: <TPayload, TPayloadInput, TError>(
    commandName: string,
    payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
    handler: CommandHandler<DomainCommand<TPayload>, TError>
  ) => Effect.Effect<void, never, never>;

  readonly dispatch: (wireCommand: WireCommand) => Effect.Effect<CommandResult, never, never>;
  readonly dispatchLocal: <TPayload>(
    command: LocalCommand<TPayload>
  ) => Effect.Effect<CommandResult, never, never>;
}

// ============================================================================
// Direct Aggregate Operations
// ============================================================================

/**
 * Direct aggregate function - bypasses command layer entirely
 * Use for simple operations where command patterns add unnecessary overhead
 *
 * These functions operate directly on aggregate state and return events.
 * They provide the fastest path for internal operations but lose command
 * audit trails and centralized validation.
 *
 * @example
 * ```typescript
 * // Direct aggregate function
 * const createUser = (userData: CreateUserData): Effect.Effect<UserCreatedEvent[], UserError, never> =>
 *   pipe(
 *     validateUserData(userData),
 *     Effect.map(validData => [UserCreatedEvent.make(validData)])
 *   );
 *
 * // Usage in aggregate
 * const UserAggregate = makeAggregateRoot(
 *   UserId,
 *   applyUserEvent,
 *   UserEventStoreTag,
 *   {
 *     createUser,
 *     updateEmail: (newEmail: string) => pipe(...),
 *     deactivate: () => pipe(...)
 *   }
 * );
 *
 * // Call directly on aggregate
 * const events = await Effect.runPromise(
 *   UserAggregate.commands.createUser({ email: 'user@example.com', name: 'User' })
 * );
 * ```
 */
export interface AggregateCommands<TEvents, TError = never, TRequirements = never> {
  readonly [commandName: string]: (
    ...args: any[]
  ) => Effect.Effect<ReadonlyArray<TEvents>, TError, TRequirements>;
}

// ============================================================================
// Command Execution Patterns
// ============================================================================

/**
 * Command execution context for audit trails and observability
 */
export interface CommandExecutionContext {
  readonly commandId: string;
  readonly commandName: string;
  readonly target: string;
  readonly executedAt: Date;
  readonly executionTime: number;
  readonly source: 'wire' | 'local' | 'direct';
}

/**
 * Enhanced command result that includes execution context
 * Provides full audit trail regardless of execution path
 */
export const CommandExecutionSuccess = Schema.extend(
  CommandSuccess,
  Schema.Struct({
    context: Schema.Struct({
      commandId: Schema.String,
      commandName: Schema.String,
      target: Schema.String,
      executedAt: Schema.ValidDateFromSelf,
      executionTime: Schema.Number,
      source: Schema.Union(
        Schema.Literal('wire'),
        Schema.Literal('local'),
        Schema.Literal('direct')
      ),
    }),
  })
);

export const CommandExecutionFailure = Schema.extend(
  CommandFailure,
  Schema.Struct({
    context: Schema.Struct({
      commandId: Schema.String,
      commandName: Schema.String,
      target: Schema.String,
      executedAt: Schema.ValidDateFromSelf,
      executionTime: Schema.Number,
      source: Schema.Union(
        Schema.Literal('wire'),
        Schema.Literal('local'),
        Schema.Literal('direct')
      ),
    }),
  })
);

/**
 * Full command result with execution context for observability
 */
export const CommandExecutionResultSchema = Schema.Union(
  CommandExecutionSuccess,
  CommandExecutionFailure
);
export type CommandExecutionResult = typeof CommandExecutionResultSchema.Type;
