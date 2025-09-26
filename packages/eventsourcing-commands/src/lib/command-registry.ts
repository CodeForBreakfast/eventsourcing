import { Schema, Effect, HashMap, Ref, Layer } from 'effect';
import {
  WireCommand,
  DomainCommand,
  CommandHandler,
  CommandResult,
  CommandValidationError,
  validateCommand,
} from './commands';

// ============================================================================
// Command Registry Implementation
// ============================================================================

interface CommandRegistration<TPayload, TPayloadInput> {
  readonly payloadSchema: Schema.Schema<TPayload, TPayloadInput>;
  readonly handler: CommandHandler<DomainCommand<TPayload>>;
}

/**
 * Command registry for wire command validation and dispatch
 */
export interface CommandRegistry {
  readonly register: <TPayload, TPayloadInput>(
    commandName: string,
    payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
    handler: CommandHandler<DomainCommand<TPayload>>
  ) => Effect.Effect<void, never, never>;

  readonly dispatch: (wireCommand: WireCommand) => Effect.Effect<CommandResult, never, never>;
}

export const makeCommandRegistry = (): Effect.Effect<CommandRegistry, never, never> =>
  Effect.gen(function* () {
    const registrationsRef = yield* Ref.make(
      HashMap.empty<string, CommandRegistration<any, any>>()
    );

    return {
      register: <TPayload, TPayloadInput>(
        commandName: string,
        payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
        handler: CommandHandler<DomainCommand<TPayload>>
      ) =>
        Ref.update(registrationsRef, (registrations) =>
          HashMap.set(registrations, commandName, {
            payloadSchema,
            handler,
          })
        ),

      dispatch: (wireCommand: WireCommand) =>
        Effect.gen(function* () {
          const registrations = yield* Ref.get(registrationsRef);
          const maybeRegistration = HashMap.get(registrations, wireCommand.name);

          if (maybeRegistration._tag === 'None') {
            return {
              _tag: 'Failure' as const,
              error: {
                _tag: 'HandlerNotFound' as const,
                commandId: wireCommand.id,
                commandName: wireCommand.name,
                availableHandlers: Array.from(HashMap.keys(registrations)),
              },
            };
          }

          const registration = maybeRegistration.value;

          const validationResult = yield* Effect.either(
            validateCommand(registration.payloadSchema)(wireCommand)
          );

          if (validationResult._tag === 'Left') {
            const error = validationResult.left;
            if (error instanceof CommandValidationError) {
              return {
                _tag: 'Failure' as const,
                error: {
                  _tag: 'ValidationError' as const,
                  commandId: error.commandId,
                  commandName: error.commandName,
                  validationErrors: error.validationErrors,
                },
              };
            }

            return {
              _tag: 'Failure' as const,
              error: {
                _tag: 'UnknownError' as const,
                commandId: wireCommand.id,
                message: String(error),
              },
            };
          }

          const domainCommand = validationResult.right;

          // Handle both failures and defects (like Effect.die)
          const handlerResult = yield* Effect.exit(registration.handler.handle(domainCommand));

          if (handlerResult._tag === 'Failure') {
            return {
              _tag: 'Failure' as const,
              error: {
                _tag: 'UnknownError' as const,
                commandId: wireCommand.id,
                message: String(handlerResult.cause),
              },
            };
          }

          return handlerResult.value;
        }),
    };
  });

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

export const registerCommand = <TPayload, TPayloadInput>(
  commandName: string,
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
  handler: CommandHandler<DomainCommand<TPayload>>
) =>
  Effect.gen(function* () {
    const registry = yield* CommandRegistryService;
    yield* registry.register(commandName, payloadSchema, handler);
  });

export const dispatchCommand = (wireCommand: WireCommand) =>
  Effect.gen(function* () {
    const registry = yield* CommandRegistryService;
    return yield* registry.dispatch(wireCommand);
  });
