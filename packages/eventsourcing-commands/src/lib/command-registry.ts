import { Schema, Context, Effect, Layer, Match, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import {
  WireCommand,
  DomainCommand,
  CommandResult,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createCommandMatcher = <TCommands extends DomainCommand<any>>() =>
  Match.type<TCommands>();

/**
 * Builds a command registry using Effect's pattern matching
 * This ensures exhaustive command handling with compile-time safety
 */
export const makeCommandRegistry = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): Context.Tag.Service<typeof CommandRegistry> => {
  // Build the exhaustive command schema
  const commandSchema = buildCommandSchema(commands);

  // Extract command names for the registry interface
  const commandNames = commands.map((cmd) => cmd.name);

  const executeMatcherWithErrorHandling = (
    command: ReadonlyDeep<CommandFromDefinitions<T>>,
    wireCommand: ReadonlyDeep<WireCommand>
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      matcher(command),
      Effect.exit,
      Effect.map((matcherResult) =>
        matcherResult._tag === 'Failure'
          ? {
              _tag: 'Failure' as const,
              error: {
                _tag: 'UnknownError' as const,
                commandId: wireCommand.id,
                message: String(matcherResult.cause),
              },
            }
          : matcherResult.value
      )
    );

  const dispatch = (
    wireCommand: ReadonlyDeep<WireCommand>
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      wireCommand,
      Schema.decodeUnknown(commandSchema),
      Effect.either,
      Effect.flatMap((parseResult) => {
        if (parseResult._tag === 'Left') {
          // Validation failed
          return Effect.succeed({
            _tag: 'Failure' as const,
            error: {
              _tag: 'ValidationError' as const,
              commandId: wireCommand.id,
              commandName: wireCommand.name,
              validationErrors: [parseResult.left.message || 'Command validation failed'],
            },
          });
        }

        // Execute the matcher with exact command type - it handles all the dispatch logic
        return executeMatcherWithErrorHandling(
          parseResult.right as ReadonlyDeep<CommandFromDefinitions<T>>,
          wireCommand
        );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: ReadonlyDeep<T>,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): Layer.Layer<CommandRegistry, never, never> =>
  Layer.succeed(CommandRegistry, makeCommandRegistry(commands, matcher));
