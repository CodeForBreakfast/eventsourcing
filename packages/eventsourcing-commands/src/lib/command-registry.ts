import { Schema, Context, Effect, Layer, Match, pipe, Either, Exit } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import {
  WireCommand,
  DomainCommand,
  CommandResult,
  CommandFailure,
  CommandDefinition,
  buildCommandSchema,
  CommandFromDefinitions,
  CommandMatcher,
} from './commands';

export class CommandRegistry extends Context.Tag('CommandRegistry')<
  CommandRegistry,
  {
    readonly dispatch: (
      wireCommand: ReadonlyDeep<WireCommand>
    ) => Effect.Effect<CommandResult, never, never>;
    readonly listCommandNames: () => ReadonlyArray<string>;
  }
>() {}

export const dispatchCommand = (
  wireCommand: ReadonlyDeep<WireCommand>
): Effect.Effect<CommandResult, never, CommandRegistry> =>
  pipe(
    CommandRegistry,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );

// ============================================================================
// Command Registry with Effect Matchers
// ============================================================================

/**
 * Helper to create a command matcher using Effect's pattern matching
 * Since our commands use 'name' instead of '_tag', this provides a convenient API
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept all command payload types
export const createCommandMatcher = <TCommands extends DomainCommand<any>>() =>
  Match.type<TCommands>();

/**
 * Builds a command registry using Effect's pattern matching
 * This ensures exhaustive command handling with compile-time safety
 */
export const makeCommandRegistry = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept command definitions with any payload type
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): Context.Tag.Service<typeof CommandRegistry> => {
  // Build the exhaustive command schema
  const commandSchema = buildCommandSchema(commands);

  // Extract command names for the registry interface
  const commandNames = commands.map((cmd) => cmd.name);

  const createUnknownErrorFailure = (commandId: string, message: string): CommandFailure => ({
    _tag: 'Failure',
    error: {
      _tag: 'UnknownError',
      commandId,
      message,
    },
  });

  const toReadonlyDeep = <A>(value: A): ReadonlyDeep<A> => value as ReadonlyDeep<A>;

  const executeMatcherWithErrorHandling = (
    command: CommandFromDefinitions<T>,
    wireCommand: ReadonlyDeep<WireCommand>
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      command,
      toReadonlyDeep,
      matcher,
      Effect.exit,
      Effect.flatMap((matcherResult) =>
        Exit.isFailure(matcherResult)
          ? Effect.succeed(createUnknownErrorFailure(wireCommand.id, String(matcherResult.cause)))
          : Effect.succeed(matcherResult.value)
      )
    );

  const createValidationErrorFailure = (
    commandId: string,
    commandName: string,
    validationErrors: ReadonlyArray<string>
  ): CommandFailure => ({
    _tag: 'Failure',
    error: {
      _tag: 'ValidationError',
      commandId,
      commandName,
      validationErrors,
    },
  });

  const dispatch = (
    wireCommand: ReadonlyDeep<WireCommand>
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      wireCommand,
      Schema.decodeUnknown(commandSchema),
      Effect.either,
      Effect.flatMap((parseResult) => {
        if (Either.isLeft(parseResult)) {
          // Validation failed
          return Effect.succeed(
            createValidationErrorFailure(wireCommand.id, wireCommand.name, [
              parseResult.left.message || 'Command validation failed',
            ])
          );
        }

        // Execute the matcher with exact command type - it handles all the dispatch logic
        return executeMatcherWithErrorHandling(parseResult.right, wireCommand);
      })
    );

  return {
    dispatch,
    listCommandNames: () => commandNames,
  };
};

/**
 * Creates a Layer with the command registry
 */
export const makeCommandRegistryLayer = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic constraint requires any to accept command definitions with any payload type
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): Layer.Layer<CommandRegistry, never, never> =>
  Layer.succeed(CommandRegistry, makeCommandRegistry(commands, matcher));
