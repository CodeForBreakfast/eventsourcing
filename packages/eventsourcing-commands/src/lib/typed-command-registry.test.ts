import { describe, test, expect } from 'bun:test';
import { Schema, Effect } from 'effect';
import { WireCommand, DomainCommand, CommandHandler } from './commands';
import {
  makeTypedCommandRegistry,
  createCommandRegistration,
  buildCommandRegistrations,
  createWireCommandSchema,
  createTypedCommandRegistryService,
  makeTypedCommandRegistryLayer,
} from './command-registry';

describe('Typed Command Registry', () => {
  // Define test payload schemas
  const CreateUserPayload = Schema.Struct({
    email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    name: Schema.String.pipe(Schema.minLength(1)),
  });

  const UpdateEmailPayload = Schema.Struct({
    newEmail: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  });

  const DeleteUserPayload = Schema.Struct({
    reason: Schema.String,
  });

  // Define handlers
  const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
    handle: (_command) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: 'user-123' as any, eventNumber: 1 },
      }),
  };

  const updateEmailHandler: CommandHandler<DomainCommand<typeof UpdateEmailPayload.Type>> = {
    handle: (_command) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: 'user-123' as any, eventNumber: 2 },
      }),
  };

  const deleteUserHandler: CommandHandler<DomainCommand<typeof DeleteUserPayload.Type>> = {
    handle: (_command) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: 'user-123' as any, eventNumber: 3 },
      }),
  };

  // Build type-safe registrations
  const registrations = buildCommandRegistrations({
    CreateUser: createCommandRegistration(CreateUserPayload, createUserHandler),
    UpdateEmail: createCommandRegistration(UpdateEmailPayload, updateEmailHandler),
    DeleteUser: createCommandRegistration(DeleteUserPayload, deleteUserHandler),
  });

  test('should create type-safe wire command schema', () => {
    const wireCommandSchema = createWireCommandSchema(registrations);

    // Valid command should parse successfully
    const validCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser' as const,
      payload: { email: 'test@example.com', name: 'John Doe' },
    };

    const parseResult = Schema.decodeUnknownSync(wireCommandSchema)(validCommand);
    expect(parseResult.name).toBe('CreateUser');
  });

  test('should reject unknown command names at schema level', async () => {
    const wireCommandSchema = createWireCommandSchema(registrations);

    const invalidCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'UnknownCommand', // This should be rejected by schema
      payload: {},
    };

    try {
      Schema.decodeUnknownSync(wireCommandSchema)(invalidCommand);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should dispatch typed commands with compile-time safety', async () => {
    const registry = makeTypedCommandRegistry(registrations);

    // This command is guaranteed to be valid by TypeScript
    const typedCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser' as const, // TypeScript enforces this is a valid command name
      payload: { email: 'test@example.com', name: 'John Doe' },
    };

    const result = await Effect.runPromise(registry.dispatch(typedCommand));
    expect(result._tag).toBe('Success');
  });

  test('should handle untyped wire commands with runtime validation', async () => {
    const registry = makeTypedCommandRegistry(registrations);

    // Valid untyped command
    const validWireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'UpdateEmail',
      payload: { newEmail: 'new@example.com' },
    };

    const result = await Effect.runPromise(registry.dispatchUntypedWire(validWireCommand));
    expect(result._tag).toBe('Success');

    // Invalid untyped command
    const invalidWireCommand: WireCommand = {
      id: 'cmd-456',
      target: 'user-789',
      name: 'NonexistentCommand',
      payload: {},
    };

    const failResult = await Effect.runPromise(registry.dispatchUntypedWire(invalidWireCommand));
    expect(failResult._tag).toBe('Failure');
    if (failResult._tag === 'Failure') {
      expect(failResult.error._tag).toBe('HandlerNotFound');
    }
  });

  test('should provide exhaustive command name list', () => {
    const registry = makeTypedCommandRegistry(registrations);
    const commandNames = registry.listCommandNames();

    expect(commandNames).toContain('CreateUser');
    expect(commandNames).toContain('UpdateEmail');
    expect(commandNames).toContain('DeleteUser');
    expect(commandNames).toHaveLength(3);
  });

  test('should work with Effect service pattern', async () => {
    const ServiceTag = createTypedCommandRegistryService<typeof registrations>();
    const layer = ServiceTag.Live(registrations);

    const program = Effect.gen(function* () {
      const service = yield* ServiceTag;

      const typedCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'DeleteUser' as const,
        payload: { reason: 'User requested deletion' },
      };

      return yield* service.dispatch(typedCommand);
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result._tag).toBe('Success');
  });

  test('should expose wire command schema for external validation', () => {
    const registry = makeTypedCommandRegistry(registrations);
    const schema = registry.wireCommandSchema;

    // Schema should accept all registered command names
    const commands = [
      { id: '1', target: 'user', name: 'CreateUser', payload: {} },
      { id: '2', target: 'user', name: 'UpdateEmail', payload: {} },
      { id: '3', target: 'user', name: 'DeleteUser', payload: {} },
    ];

    commands.forEach((cmd) => {
      expect(() => Schema.decodeUnknownSync(schema)(cmd)).not.toThrow();
    });

    // Should reject unknown command
    expect(() =>
      Schema.decodeUnknownSync(schema)({
        id: '4',
        target: 'user',
        name: 'UnknownCommand',
        payload: {},
      })
    ).toThrow();
  });

  test('type inference should work correctly', () => {
    const registry = makeTypedCommandRegistry(registrations);

    // TypeScript should infer the correct type for command names
    const commandNames = registry.listCommandNames();

    // This demonstrates that TypeScript knows these are the only valid values
    type ExpectedCommandNames = 'CreateUser' | 'UpdateEmail' | 'DeleteUser';
    const _typeCheck: ExpectedCommandNames[] = commandNames;

    expect(commandNames).toBeDefined();
  });
});
