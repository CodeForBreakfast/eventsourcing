import { Effect, Schema, HashMap, pipe, Ref, Layer } from 'effect';
import {
  CommandRegistry,
  CommandHandler,
  DomainCommand,
  WireCommand,
  CommandResult,
  CommandValidationError,
  CommandHandlerNotFoundError,
  CommandExecutionError,
  validateCommand,
} from './commands';

// ============================================================================
// Command Registry Implementation
// ============================================================================

interface RegistryEntry {
  readonly validate: (
    wireCommand: WireCommand
  ) => Effect.Effect<DomainCommand, CommandValidationError, never>;
  readonly handler: CommandHandler<DomainCommand, any>;
}

interface CommandRegistryState {
  readonly handlers: HashMap.HashMap<string, RegistryEntry>;
}

const makeCommandRegistry = (): Effect.Effect<CommandRegistry, never, never> =>
  pipe(
    Ref.make<CommandRegistryState>({ handlers: HashMap.empty() }),
    Effect.map((stateRef) => ({
      register: <TPayload, TPayloadInput, TError>(
        commandName: string,
        payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
        handler: CommandHandler<DomainCommand<TPayload>, TError>
      ) =>
        pipe(
          Ref.update(stateRef, (state) => ({
            handlers: HashMap.set(state.handlers, commandName, {
              validate: validateCommand(payloadSchema),
              handler: handler as CommandHandler<DomainCommand, any>,
            }),
          })),
          Effect.asVoid
        ),

      dispatch: (wireCommand: WireCommand) =>
        pipe(
          Ref.get(stateRef),
          Effect.flatMap((state) => {
            const maybeEntry = HashMap.get(state.handlers, wireCommand.name);

            if (maybeEntry._tag === 'None') {
              return Effect.succeed({
                _tag: 'Failure' as const,
                error: {
                  _tag: 'HandlerNotFound' as const,
                  commandId: wireCommand.id,
                  commandName: wireCommand.name,
                  availableHandlers: Array.from(HashMap.keys(state.handlers)),
                },
              });
            }

            const entry = maybeEntry.value;

            return pipe(
              entry.validate(wireCommand),
              Effect.matchEffect({
                onFailure: (validationError) =>
                  Effect.succeed({
                    _tag: 'Failure' as const,
                    error: {
                      _tag: 'ValidationError' as const,
                      commandId: wireCommand.id,
                      commandName: wireCommand.name,
                      validationErrors:
                        validationError._tag === 'CommandValidationError'
                          ? validationError.validationErrors
                          : ['Unknown validation error'],
                    },
                  }),
                onSuccess: (domainCommand) =>
                  pipe(
                    entry.handler.handle(domainCommand),
                    Effect.matchEffect({
                      onFailure: (cause) =>
                        Effect.succeed({
                          _tag: 'Failure' as const,
                          error: {
                            _tag: 'ExecutionError' as const,
                            commandId: wireCommand.id,
                            commandName: wireCommand.name,
                            message: cause instanceof Error ? cause.message : String(cause),
                          },
                        }),
                      onSuccess: (result) => Effect.succeed(result),
                    })
                  ),
              })
            );
          })
        ),
    }))
  );

// ============================================================================
// Service Definition
// ============================================================================

export class CommandRegistryService extends Effect.Tag('CommandRegistryService')<
  CommandRegistryService,
  CommandRegistry
>() {}

export const CommandRegistryLive = Layer.effect(CommandRegistryService, makeCommandRegistry());

// ============================================================================
// Convenience Functions
// ============================================================================

export const registerCommand = <TPayload, TPayloadInput, TError>(
  commandName: string,
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
  handler: CommandHandler<DomainCommand<TPayload>, TError>
) =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.register(commandName, payloadSchema, handler))
  );

export const dispatchCommand = (wireCommand: WireCommand) =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );
