import { Schema, Effect, pipe, Layer } from 'effect';
import {
  WireCommand,
  DomainCommand,
  CommandHandler,
  CommandResult,
  CommandValidationError,
  validateCommand,
} from './commands';

// ============================================================================
// Type-Safe Command Registry Implementation
// ============================================================================

export interface CommandRegistration<TPayload, TPayloadInput> {
  readonly payloadSchema: Schema.Schema<TPayload, TPayloadInput>;
  readonly handler: CommandHandler<DomainCommand<TPayload>>;
}

/**
 * Type-safe command registrations map
 * The keys become the exhaustive set of valid command names
 */
export type CommandRegistrations = Record<string, CommandRegistration<any, any>>;

/**
 * Extract command names as literal union type from registrations
 */
export type CommandNames<T extends CommandRegistrations> = keyof T;

/**
 * Type-safe wire command that only accepts known command names
 */
export const createWireCommandSchema = <T extends CommandRegistrations>(registrations: T) => {
  const commandNames = Object.keys(registrations) as Array<keyof T>;

  return Schema.Struct({
    id: Schema.String,
    target: Schema.String,
    name: Schema.Union(...commandNames.map((name) => Schema.Literal(name))),
    payload: Schema.Unknown,
  });
};

/**
 * Type-safe command registry with exhaustive command name validation
 */
export interface TypedCommandRegistry<T extends CommandRegistrations> {
  readonly dispatch: (
    wireCommand: Schema.Schema.Type<ReturnType<typeof createWireCommandSchema<T>>>
  ) => Effect.Effect<CommandResult, never, never>;
  readonly dispatchUntypedWire: (
    wireCommand: WireCommand
  ) => Effect.Effect<CommandResult, never, never>;
  readonly listCommandNames: () => ReadonlyArray<CommandNames<T>>;
  readonly wireCommandSchema: ReturnType<typeof createWireCommandSchema<T>>;
}

/**
 * Creates a type-safe command registry where command names are exhaustively checked
 */
export const makeTypedCommandRegistry = <T extends CommandRegistrations>(
  registrations: T
): TypedCommandRegistry<T> => {
  const wireCommandSchema = createWireCommandSchema(registrations);

  const dispatchTypedWire = (
    wireCommand: Schema.Schema.Type<typeof wireCommandSchema>
  ): Effect.Effect<CommandResult, never, never> => {
    // TypeScript guarantees this lookup will succeed
    const registration = registrations[wireCommand.name];
    return dispatchWithRegistration(wireCommand, registration);
  };

  const dispatchUntypedWire = (
    wireCommand: WireCommand
  ): Effect.Effect<CommandResult, never, never> =>
    pipe(
      Schema.decodeUnknown(wireCommandSchema)(wireCommand),
      Effect.either,
      Effect.flatMap((result) =>
        result._tag === 'Left'
          ? Effect.succeed({
              _tag: 'Failure' as const,
              error: {
                _tag: 'HandlerNotFound' as const,
                commandId: wireCommand.id,
                commandName: wireCommand.name,
                availableHandlers: Object.keys(registrations),
              },
            })
          : dispatchTypedWire(result.right)
      )
    );

  return {
    dispatch: dispatchTypedWire,
    dispatchUntypedWire,
    listCommandNames: () => Object.keys(registrations) as Array<CommandNames<T>>,
    wireCommandSchema,
  };
};

/**
 * Legacy command registry interface for backward compatibility
 */
export interface CommandRegistry {
  readonly dispatch: (wireCommand: WireCommand) => Effect.Effect<CommandResult, never, never>;
  readonly listCommandNames: () => ReadonlyArray<string>;
}

/**
 * Legacy command registry factory - use makeTypedCommandRegistry for new code
 * @deprecated Use makeTypedCommandRegistry for compile-time safety
 */
export const makeCommandRegistry = (
  registrations: Record<string, CommandRegistration<any, any>>
): CommandRegistry => {
  const typedRegistry = makeTypedCommandRegistry(registrations);
  return {
    dispatch: typedRegistry.dispatchUntypedWire,
    listCommandNames: () => typedRegistry.listCommandNames() as ReadonlyArray<string>,
  };
};

const dispatchWithRegistration = (
  wireCommand: WireCommand,
  registration: CommandRegistration<any, any>
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
  _wireCommand: WireCommand,
  error: CommandValidationError
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
  wireCommand: WireCommand,
  domainCommand: DomainCommand<any>,
  handler: CommandHandler<DomainCommand<any>>
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

// ============================================================================
// Service Definition
// ============================================================================

export class CommandRegistryService extends Effect.Tag('CommandRegistryService')<
  CommandRegistryService,
  CommandRegistry
>() {}

/**
 * Creates a type-safe command registry service tag for a specific registration set
 */
export const createTypedCommandRegistryService = <T extends CommandRegistrations>() => {
  class TypedCommandRegistryService extends Effect.Tag('TypedCommandRegistryService')<
    TypedCommandRegistryService,
    TypedCommandRegistry<T>
  >() {
    /**
     * Creates a live layer for this service
     */
    static Live = (registrations: T) =>
      Layer.succeed(TypedCommandRegistryService, makeTypedCommandRegistry(registrations));
  }
  return TypedCommandRegistryService;
};

/**
 * Creates a legacy command registry layer
 * @deprecated Use makeTypedCommandRegistryLayer for compile-time safety
 */
export const makeCommandRegistryLayer = (
  registrations: Record<string, CommandRegistration<any, any>>
): Layer.Layer<CommandRegistryService, never, never> =>
  Layer.succeed(CommandRegistryService, makeCommandRegistry(registrations));

/**
 * Creates a type-safe command registry layer
 */
export const makeTypedCommandRegistryLayer = <T extends CommandRegistrations>(registrations: T) => {
  const ServiceTag = createTypedCommandRegistryService<T>();
  return ServiceTag.Live(registrations);
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Helper to create command registrations in a type-safe way
 */
export const createCommandRegistration = <TPayload, TPayloadInput>(
  payloadSchema: Schema.Schema<TPayload, TPayloadInput>,
  handler: CommandHandler<DomainCommand<TPayload>>
): CommandRegistration<TPayload, TPayloadInput> => ({
  payloadSchema,
  handler,
});

/**
 * Helper to build command registrations record with type safety
 */
export const buildCommandRegistrations = <T extends CommandRegistrations>(registrations: T): T =>
  registrations;

/**
 * Type-safe command dispatch using typed registry service
 */
export const dispatchTypedCommand =
  <T extends CommandRegistrations>(
    ServiceTag: ReturnType<typeof createTypedCommandRegistryService<T>>
  ) =>
  (wireCommand: Schema.Schema.Type<ReturnType<typeof createWireCommandSchema<T>>>) =>
    pipe(
      ServiceTag,
      Effect.flatMap((registry) => registry.dispatch(wireCommand))
    );

/**
 * Parse and dispatch untyped wire command using typed registry service
 */
export const parseAndDispatchCommand =
  <T extends CommandRegistrations>(
    ServiceTag: ReturnType<typeof createTypedCommandRegistryService<T>>
  ) =>
  (wireCommand: WireCommand) =>
    pipe(
      ServiceTag,
      Effect.flatMap((registry) => registry.dispatchUntypedWire(wireCommand))
    );

/**
 * Get type-safe wire command schema from typed registry service
 */
export const getWireCommandSchema = <T extends CommandRegistrations>(
  ServiceTag: ReturnType<typeof createTypedCommandRegistryService<T>>
) =>
  pipe(
    ServiceTag,
    Effect.map((registry) => registry.wireCommandSchema)
  );

/**
 * Legacy command dispatch - use typed versions for new code
 * @deprecated Use dispatchTypedCommand or parseAndDispatchCommand
 */
export const dispatchCommand = (wireCommand: WireCommand) =>
  pipe(
    CommandRegistryService,
    Effect.flatMap((registry) => registry.dispatch(wireCommand))
  );

/**
 * Legacy command list - use typed versions for new code
 * @deprecated Use typed registry service
 */
export const listRegisteredCommands = () =>
  pipe(
    CommandRegistryService,
    Effect.map((registry) => registry.listCommandNames())
  );
