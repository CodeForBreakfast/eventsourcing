import { Schema, Data, pipe, Effect } from 'effect';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// Wire Commands - External Transport Layer
// ============================================================================

/**
 * Wire command for transport/serialization
 * Used by APIs, message queues, and other external interfaces
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
 * @deprecated Use WireCommand for clarity
 */
export type Command = WireCommand;

// ============================================================================
// Domain Command Types
// ============================================================================

/**
 * Base domain command interface
 * The validated internal representation
 */
export interface DomainCommand<TPayload = unknown> {
  readonly id: string;
  readonly target: string;
  readonly name: string;
  readonly payload: TPayload;
}

// ============================================================================
// Command Errors
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
// Command Results
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

export const CommandResult = Schema.Union(CommandSuccess, CommandFailure);
export type CommandResult = typeof CommandResult.Type;

// ============================================================================
// Command Validation Helpers
// ============================================================================

/**
 * Command definition that pairs a name with its payload schema
 */
export interface CommandDefinition<TName extends string, TPayload, TPayloadInput> {
  readonly name: TName;
  readonly payloadSchema: Schema.Schema<TPayload, TPayloadInput>;
}

/**
 * Creates a command definition
 */
export const defineCommand = <TName extends string, TPayload, TPayloadInput>(
  name: TName,
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>
): CommandDefinition<TName, TPayload, TPayloadInput> => ({
  name,
  payloadSchema,
});

/**
 * Builds a discriminated union schema from command definitions
 * This creates an exhaustive schema that can parse any registered command
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildCommandSchema = <T extends ReadonlyArray<CommandDefinition<any, any, any>>>(
  commands: T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Schema.Schema<{
  readonly id: string;
  readonly target: string;
  readonly name: any;
  readonly payload: any;
}> => {
  if (commands.length === 0) {
    throw new Error('At least one command definition is required');
  }

  const schemas = commands.map((cmd) =>
    Schema.Struct({
      id: Schema.String,
      target: Schema.String,
      name: Schema.Literal(cmd.name),
      payload: cmd.payloadSchema,
    })
  );

  if (schemas.length === 1) {
    return schemas[0]!;
  }

  // Need at least 2 schemas for Union
  const [first, second, ...rest] = schemas;
  if (!first || !second) {
    throw new Error('Unexpected state: should have at least 2 schemas');
  }
  return Schema.Union(first, second, ...rest);
};

/**
 * Validates and transforms a wire command into a domain command
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
// Command Handler Types
// ============================================================================

/**
 * Command handler function type
 */
export interface CommandHandler<
  TCommand extends DomainCommand,
  TError = never,
  TResult = CommandResult,
> {
  readonly handle: (command: TCommand) => Effect.Effect<TResult, TError, never>;
}
