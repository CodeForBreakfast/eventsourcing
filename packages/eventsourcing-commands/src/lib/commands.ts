import { Schema, Data, Effect, pipe } from 'effect';
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
// Command Result Type Guards
// ============================================================================

export const isCommandSuccess = Schema.is(CommandSuccess);

export const isCommandFailure = Schema.is(CommandFailure);

// ============================================================================
// Command Validation Helpers
// ============================================================================

/**
 * Command definition that pairs a name with its payload schema
 */
export interface CommandDefinition<TName extends string, TPayload> {
  readonly name: TName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema input type can be any, TypeScript will infer the correct type from schema definition
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept command definitions with any payload type
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

const buildSchemaFromCommandList = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept command definitions with any payload type
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>
) => {
  const schemas = commands.map((cmd) =>
    Schema.Struct({
      id: Schema.String,
      target: Schema.String,
      name: Schema.Literal(cmd.name),
      payload: cmd.payloadSchema,
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type assertion required to match return type when single schema array
  const singleSchema = schemas.length === 1 ? (schemas[0]! as any) : null;
  const returnValue =
    singleSchema !== null
      ? singleSchema
      : (() => {
          const [first, second, ...rest] = schemas;
          const hasRequiredSchemas = !!first && !!second;
          return hasRequiredSchemas
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type assertion required to match return type for union of variable schemas
              (Schema.Union(first, second, ...rest) as any)
            : (() => {
                throw new Error('Unexpected state: should have at least 2 schemas');
              })();
        })();

  return returnValue;
};

/**
 * Builds a discriminated union schema from command definitions
 * This creates an exhaustive schema that can parse any registered command
 */
export const buildCommandSchema = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept command definitions with any payload type
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>
): Schema.Schema<
  CommandFromDefinitions<T>,
  { readonly id: string; readonly target: string; readonly name: string; readonly payload: unknown }
> => (
  commands.length === 0 &&
    (() => {
      throw new Error('At least one command definition is required');
    })(),
  buildSchemaFromCommandList(commands)
);

/**
 * Validates and transforms a wire command into a domain command
 */
export const validateCommand =
  <TPayload, TPayloadInput>(payloadSchema: Schema.Schema<TPayload, TPayloadInput>) =>
  (wireCommand: ReadonlyDeep<WireCommand>) =>
    pipe(
      wireCommand.payload,
      Schema.decodeUnknown(payloadSchema),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept all command payload types
export type CommandMatcher<TCommands extends DomainCommand<any>> = (
  command: ReadonlyDeep<TCommands>
) => Effect.Effect<CommandResult, never, never>;
