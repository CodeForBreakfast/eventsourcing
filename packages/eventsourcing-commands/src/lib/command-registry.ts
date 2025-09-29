import { Schema, Effect, pipe, Layer, Match } from 'effect';
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

export interface CommandRegistry {
  readonly dispatch: (
    wireCommand: ReadonlyDeep<WireCommand>
  ) => Effect.Effect<CommandResult, never, never>;
  readonly listCommandNames: () => ReadonlyArray<string>;
}

export class CommandRegistryService extends Effect.Tag('CommandRegistryService')<
  CommandRegistryService,
  CommandRegistry
>() {}

export const dispatchCommand = (
  wireCommand: ReadonlyDeep<WireCommand>
): Effect.Effect<CommandResult, never, CommandRegistryService> =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );

// ============================================================================
// Command Registry with Effect Matchers
// ============================================================================

/**
 * Helper to create a command matcher using Effect's pattern matching
 * Since our commands use 'name' instead of '_tag', this provides a convenient API
 */
export const createCommandMatcher = <TCommands extends DomainCommand>() => Match.type<TCommands>();

/**
 * Builds a command registry using Effect's pattern matching
 * This ensures exhaustive command handling with compile-time safety
 */
export const makeCommandRegistry = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T extends readonly CommandDefinition<string, any>[],
>(
  commands: T,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): CommandRegistry => {
  // Build the exhaustive command schema
  const commandSchema = buildCommandSchema(commands);

  // Extract command names for the registry interface
  const commandNames = commands.map((cmd) => cmd.name);

  const dispatch = (
    wireCommand: ReadonlyDeep<WireCommand>
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      // Parse the entire command with the exhaustive schema
      Schema.decodeUnknown(commandSchema)(wireCommand),
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
        return pipe(
          matcher(parseResult.right),
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
  commands: T,
  matcher: CommandMatcher<CommandFromDefinitions<T>>
): Layer.Layer<CommandRegistryService, never, never> =>
  Layer.succeed(CommandRegistryService, makeCommandRegistry(commands, matcher));
