import { Schema, Effect, pipe, Layer } from 'effect';
import {
  WireCommand,
  DomainCommand,
  CommandHandler,
  CommandResult,
  CommandDefinition,
  buildCommandSchema,
  CommandFromDefinitions,
} from './commands';

export interface CommandRegistry {
  readonly dispatch: (wireCommand: WireCommand) => Effect.Effect<CommandResult, never, never>;
  readonly listCommandNames: () => ReadonlyArray<string>;
}

export class CommandRegistryService extends Effect.Tag('CommandRegistryService')<
  CommandRegistryService,
  CommandRegistry
>() {}

export const dispatchCommand = (
  wireCommand: WireCommand
): Effect.Effect<CommandResult, never, CommandRegistryService> =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );

// ============================================================================
// Typed Command Registry - New strongly typed approach
// ============================================================================

export interface CommandRegistration<TName extends string, TPayload> {
  readonly command: CommandDefinition<TName, TPayload>;
  readonly handler: CommandHandler<DomainCommand<TPayload>>;
}

/**
 * Creates a command registration
 */
export const createRegistration = <TName extends string, TPayload>(
  command: CommandDefinition<TName, TPayload>,
  handler: CommandHandler<DomainCommand<TPayload>>
): CommandRegistration<TName, TPayload> => ({
  command,
  handler,
});

/**
 * Builds a typed command registry from command registrations
 * This ensures each command name maps to exactly one payload schema
 */
export const makeCommandRegistry = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T extends readonly CommandRegistration<string, any>[],
>(
  registrations: T
): CommandRegistry => {
  // Build the exhaustive command schema
  const commandDefinitions = registrations.map((r) => r.command);
  const commandSchema = buildCommandSchema(commandDefinitions);

  // Build handler map with exact types
  type Commands = CommandFromDefinitions<{ [K in keyof T]: T[K]['command'] }>;
  const handlers = new Map<string, CommandHandler<Commands>>();

  for (const reg of registrations) {
    if (handlers.has(reg.command.name)) {
      throw new Error(`Duplicate command registration for: ${reg.command.name}`);
    }
    // Handler is compatible because registration pairs command with its handler
    handlers.set(reg.command.name, reg.handler as CommandHandler<Commands>);
  }

  const dispatch = (wireCommand: WireCommand): Effect.Effect<CommandResult, never, never> =>
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

        // Get the handler (should always exist since schema validated the name)
        const handler = handlers.get(parseResult.right.name);
        if (!handler) {
          // This shouldn't happen if schema is built correctly
          return Effect.succeed({
            _tag: 'Failure' as const,
            error: {
              _tag: 'HandlerNotFound' as const,
              commandId: wireCommand.id,
              commandName: wireCommand.name,
              availableHandlers: Array.from(handlers.keys()),
            },
          });
        }

        // Execute the handler with exact command type
        return pipe(
          handler.handle(parseResult.right as Commands),
          Effect.exit,
          Effect.map((handlerResult) =>
            handlerResult._tag === 'Failure'
              ? {
                  _tag: 'Failure' as const,
                  error: {
                    _tag: 'UnknownError' as const,
                    commandId: wireCommand.id,
                    message: String(handlerResult.cause),
                  },
                }
              : handlerResult.value
          )
        );
      })
    );

  return {
    dispatch,
    listCommandNames: () => Array.from(handlers.keys()),
  };
};

/**
 * Creates a Layer with the typed command registry
 */
export const makeCommandRegistryLayer = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends readonly CommandRegistration<string, any>[],
>(
  registrations: T
): Layer.Layer<CommandRegistryService, never, never> =>
  Layer.succeed(CommandRegistryService, makeCommandRegistry(registrations));
