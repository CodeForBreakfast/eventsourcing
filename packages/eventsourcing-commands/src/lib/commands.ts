import { Schema, Data, pipe, Effect } from 'effect';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

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
export { WireCommand as Command };
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
}
