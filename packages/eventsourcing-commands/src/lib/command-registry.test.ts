import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Schema, Effect, pipe } from 'effect';
import type { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, DomainCommand, CommandHandler, defineCommand } from './commands';
import { makeCommandRegistry, createRegistration } from './command-registry';

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
    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const registrations = [createRegistration(createUserCommand, createUserHandler)];
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
    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const registrations = [createRegistration(createUserCommand, createUserHandler)];
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

  it.effect('should handle unknown commands', () => {
    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const registrations = [createRegistration(createUserCommand, createUserHandler)];
    const registry = makeCommandRegistry(registrations);

    const unknownCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'UnknownCommand',
      payload: {},
    };

    return pipe(
      registry.dispatch(unknownCommand),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error._tag).toBe('HandlerNotFound');
            if (result.error._tag === 'HandlerNotFound') {
              expect(result.error.commandName).toBe('UnknownCommand');
              expect(result.error.availableHandlers).toEqual(['CreateUser']);
            }
          }
        })
      )
    );
  });

  it.effect('should handle command execution errors', () => {
    const failingHandler: CommandHandler<DomainCommand<typeof UserPayload.Type>> = {
      handle: () => Effect.die(new Error('Something went wrong')),
    };

    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const registrations = [createRegistration(createUserCommand, failingHandler)];
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

    return pipe(
      registry.dispatch(wireCommand),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error._tag).toBe('UnknownError');
          }
        })
      )
    );
  });

  it.effect('should support multiple command types', () => {
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

    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const updateEmailCommand = defineCommand('UpdateEmail', UpdateEmailPayload);
    const registrations = [
      createRegistration(createUserCommand, createUserHandler),
      createRegistration(updateEmailCommand, updateEmailHandler),
    ];
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

    return pipe(
      Effect.all([registry.dispatch(createCommand), registry.dispatch(updateCommand)]),
      Effect.tap((results) =>
        Effect.sync(() => {
          expect(results[0]._tag).toBe('Success');
          expect(results[1]._tag).toBe('Success');
        })
      )
    );
  });
});
