import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Schema, Effect, pipe } from 'effect';
import type { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, DomainCommand, CommandHandler } from './commands';
import {
  makeCommandRegistry,
  createCommandRegistration,
  buildCommandRegistrations,
} from './command-registry';

describe('Command Registry', () => {
  const UserPayload = Schema.Struct({
    email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    name: Schema.String.pipe(Schema.minLength(1)),
  });

  const createUserHandler: CommandHandler<DomainCommand<typeof UserPayload.Type>> = {
    handle: (_command) =>
      Effect.succeed({
        _tag: 'Success' as const,
        position: { streamId: 'user-123', eventNumber: 1 } as EventStreamPosition,
      }),
  };

  it.effect('should register and dispatch commands successfully', () => {
    const registrations = buildCommandRegistrations({
      CreateUser: createCommandRegistration(UserPayload, createUserHandler),
    });
    const registry = makeCommandRegistry(registrations);

    // Create a valid wire command
    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: {
        email: 'test@example.com',
        name: 'John Doe',
      },
    };

    // Dispatch the command
    return pipe(
      registry.dispatch(wireCommand),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result._tag).toBe('Success');
          if (result._tag === 'Success') {
            expect(result.position.eventNumber).toBe(1);
          }
        })
      )
    );
  });

  it.effect('should handle validation errors', () => {
    const registrations = buildCommandRegistrations({
      CreateUser: createCommandRegistration(UserPayload, createUserHandler),
    });
    const registry = makeCommandRegistry(registrations);

    const invalidCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: {
        email: 'invalid-email', // Invalid email
        name: '', // Empty name
      },
    };

    return pipe(
      registry.dispatch(invalidCommand),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error._tag).toBe('ValidationError');
            if (result.error._tag === 'ValidationError') {
              expect(result.error.commandId).toBe('cmd-123');
              expect(result.error.commandName).toBe('CreateUser');
              expect(result.error.validationErrors.length).toBeGreaterThan(0);
            }
          }
        })
      )
    );
  });

  test('should handle unknown commands', async () => {
    const registrations = buildCommandRegistrations({
      CreateUser: createCommandRegistration(UserPayload, createUserHandler),
    });
    const registry = makeCommandRegistry(registrations);

    const unknownCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'UnknownCommand',
      payload: {},
    };

    const result = await Effect.runPromise(registry.dispatch(unknownCommand));

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.error._tag).toBe('HandlerNotFound');
      if (result.error._tag === 'HandlerNotFound') {
        expect(result.error.commandName).toBe('UnknownCommand');
        expect(result.error.availableHandlers).toEqual(['CreateUser']);
      }
    }
  });

  test('should handle command execution errors', async () => {
    const failingHandler: CommandHandler<DomainCommand<typeof UserPayload.Type>> = {
      handle: () => Effect.die(new Error('Something went wrong')),
    };

    const registrations = buildCommandRegistrations({
      CreateUser: createCommandRegistration(UserPayload, failingHandler),
    });
    const registry = makeCommandRegistry(registrations);

    const wireCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: {
        email: 'test@example.com',
        name: 'John Doe',
      },
    };

    const result = await Effect.runPromise(registry.dispatch(wireCommand));

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.error._tag).toBe('UnknownError');
    }
  });

  test('should support multiple command types', async () => {
    const UpdateEmailPayload = Schema.Struct({
      newEmail: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    });

    const updateEmailHandler: CommandHandler<DomainCommand<typeof UpdateEmailPayload.Type>> = {
      handle: () =>
        Effect.succeed({
          _tag: 'Success' as const,
          position: { streamId: 'user-123', eventNumber: 2 } as EventStreamPosition,
        }),
    };

    const registrations = buildCommandRegistrations({
      CreateUser: createCommandRegistration(UserPayload, createUserHandler),
      UpdateEmail: createCommandRegistration(UpdateEmailPayload, updateEmailHandler),
    });
    const registry = makeCommandRegistry(registrations);

    // Test both commands work
    const createCommand: WireCommand = {
      id: 'cmd-1',
      target: 'user-456',
      name: 'CreateUser',
      payload: { email: 'test@example.com', name: 'John Doe' },
    };

    const updateCommand: WireCommand = {
      id: 'cmd-2',
      target: 'user-456',
      name: 'UpdateEmail',
      payload: { newEmail: 'new@example.com' },
    };

    const results = await Effect.runPromise(
      Effect.all([registry.dispatch(createCommand), registry.dispatch(updateCommand)])
    );

    expect(results[0]._tag).toBe('Success');
    expect(results[1]._tag).toBe('Success');
  });
});
