import { Schema, Data, pipe, Effect } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
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

// ============================================================================
// Domain Command Types
// ============================================================================

/**
 * Base domain command interface
 * The validated internal representation
 */
export interface DomainCommand<TPayload> {
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
export interface CommandDefinition<TName extends string, TPayload> {
  readonly name: TName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly payloadSchema: Schema.Schema<TPayload, any>;
}

/**
 * Creates a command definition
 */
export const defineCommand = <TName extends string, TPayload, TPayloadInput>(
  name: TName,
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>
): CommandDefinition<TName, TPayload> => ({
  name,
  payloadSchema,
});

/**
 * Helper type to extract command union from command definitions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandFromDefinitions<T extends readonly CommandDefinition<string, any>[]> = {
  readonly [K in keyof T]: T[K] extends CommandDefinition<infer Name, infer Payload>
    ? {
        readonly id: string;
        readonly target: string;
        readonly name: Name;
        readonly payload: Payload;
      }
    : never;
}[number];

/**
 * Builds a discriminated union schema from command definitions
 * This creates an exhaustive schema that can parse any registered command
 */
export const buildCommandSchema = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>
): Schema.Schema<
  CommandFromDefinitions<T>,
  { readonly id: string; readonly target: string; readonly name: string; readonly payload: unknown }
> => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return schemas[0]! as any;
  }

  // Need at least 2 schemas for Union
  const [first, second, ...rest] = schemas;
  if (!first || !second) {
    throw new Error('Unexpected state: should have at least 2 schemas');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Schema.Union(first, second, ...rest) as any;
};

/**
 * Validates and transforms a wire command into a domain command
 */
export const validateCommand =
  <TPayload, TPayloadInput>(payloadSchema: Schema.Schema<TPayload, TPayloadInput>) =>
  (wireCommand: ReadonlyDeep<WireCommand>) =>
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
// Command Matcher Types
// ============================================================================

/**
 * Command matcher function type
 * Uses Effect's pattern matching for exhaustive command handling
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandMatcher<TCommands extends DomainCommand<any>> = (
  command: ReadonlyDeep<TCommands>
) => Effect.Effect<CommandResult, never, never>;
