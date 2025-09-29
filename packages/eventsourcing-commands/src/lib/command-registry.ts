import { Schema, Effect, pipe, Layer } from 'effect';
import {
  WireCommand,
  DomainCommand,
  CommandHandler,
  CommandResult,
  CommandValidationError,
  validateCommand,
} from './commands';

export interface CommandRegistration<TPayload, TPayloadInput> {
  readonly payloadSchema: Schema.Schema<TPayload, TPayloadInput>;
  readonly handler: CommandHandler<DomainCommand<TPayload>>;
}

// Need `any` here because Effect Schema types are not covariant - we can't store
// different CommandRegistration<T1, U1> and CommandRegistration<T2, U2> in the same Record
// with a common base type. This is type-safe at runtime because we validate the schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandRegistrations = Record<string, CommandRegistration<any, any>>;

export type CommandNames<T extends CommandRegistrations> = keyof T;

export interface CommandRegistry {
  readonly dispatch: (
    wireCommand: Readonly<WireCommand>
  ) => Effect.Effect<CommandResult, never, never>;
  readonly listCommandNames: () => ReadonlyArray<string>;
}

export const makeCommandRegistry = <T extends CommandRegistrations>(
  registrations: Readonly<T>
): CommandRegistry => {
  const dispatchWire = (
    wireCommand: Readonly<WireCommand>
  ): Effect.Effect<CommandResult, never, never> => {
    const registration = registrations[wireCommand.name];
    if (!registration) {
      return Effect.succeed({
        _tag: 'Failure' as const,
        error: {
          _tag: 'HandlerNotFound' as const,
          commandId: wireCommand.id,
          commandName: wireCommand.name,
          availableHandlers: Object.keys(registrations),
        },
      });
    }
    return dispatchWithRegistration(wireCommand, registration);
  };

  return {
    dispatch: dispatchWire,
    listCommandNames: () => Object.keys(registrations),
  };
};

const dispatchWithRegistration = (
  wireCommand: Readonly<WireCommand>,
  // Safe `any` because the registration comes from a typed record and
  // payload validation ensures runtime type safety
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registration: Readonly<CommandRegistration<any, any>>
): Effect.Effect<CommandResult, never, never> =>
  pipe(
    validateCommand(registration.payloadSchema)(wireCommand),
    Effect.either,
    Effect.flatMap((validationResult) =>
      validationResult._tag === 'Left'
        ? handleValidationError(wireCommand, validationResult.left)
        : executeHandler(wireCommand, validationResult.right, registration.handler)
    )
  );

const handleValidationError = (
  _wireCommand: Readonly<WireCommand>,
  error: Readonly<CommandValidationError>
): Effect.Effect<CommandResult, never, never> =>
  Effect.succeed({
    _tag: 'Failure' as const,
    error: {
      _tag: 'ValidationError' as const,
      commandId: error.commandId,
      commandName: error.commandName,
      validationErrors: error.validationErrors,
    },
  });

const executeHandler = (
  wireCommand: Readonly<WireCommand>,
  // Safe `any` because the command has been validated by the schema before reaching here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  domainCommand: Readonly<DomainCommand<any>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: Readonly<CommandHandler<DomainCommand<any>>>
): Effect.Effect<CommandResult, never, never> =>
  pipe(
    handler.handle(domainCommand),
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

export class CommandRegistryService extends Effect.Tag('CommandRegistryService')<
  CommandRegistryService,
  CommandRegistry
>() {}

export const makeCommandRegistryLayer = <T extends CommandRegistrations>(
  registrations: Readonly<T>
): Layer.Layer<CommandRegistryService, never, never> =>
  Layer.succeed(CommandRegistryService, makeCommandRegistry(registrations));

export const createCommandRegistration = <TPayload, TPayloadInput>(
  payloadSchema: Readonly<Schema.Schema<TPayload, TPayloadInput>>,
  handler: Readonly<CommandHandler<DomainCommand<TPayload>>>
): CommandRegistration<TPayload, TPayloadInput> => ({
  payloadSchema,
  handler,
});

export const buildCommandRegistrations = <T extends CommandRegistrations>(
  registrations: Readonly<T>
): Readonly<T> => registrations;

export const dispatchCommand = (
  wireCommand: Readonly<WireCommand>
): Effect.Effect<CommandResult, never, CommandRegistryService> =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );
