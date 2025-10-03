import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Schema, Effect, pipe, Match } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import type { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, defineCommand, CommandFromDefinitions } from './commands';
import { makeCommandRegistry } from './command-registry';

describe('Command Registry', () => {
  const UserPayload = Schema.Struct({
    email: pipe(Schema.String, Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    name: pipe(Schema.String, Schema.minLength(1)),
  });

  it.effect('should register and dispatch commands successfully', () => {
    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const commands = [createUserCommand] as const;

    type Commands = CommandFromDefinitions<typeof commands>;

    const commandMatcher = (command: ReadonlyDeep<Commands>) =>
      pipe(
        command,
        Match.value,
        Match.when({ name: 'CreateUser' }, () =>
          Effect.succeed({
            _tag: 'Success' as const,
            position: { streamId: 'user-123', eventNumber: 1 } as EventStreamPosition,
          })
        ),
        Match.exhaustive
      );

    const registry = makeCommandRegistry(commands, commandMatcher);

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
      wireCommand,
      registry.dispatch,
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
    const commands = [createUserCommand] as const;

    type Commands = CommandFromDefinitions<typeof commands>;

    const commandMatcher = (command: ReadonlyDeep<Commands>) =>
      pipe(
        command,
        Match.value,
        Match.when({ name: 'CreateUser' }, () =>
          Effect.succeed({
            _tag: 'Success' as const,
            position: { streamId: 'user-123', eventNumber: 1 } as EventStreamPosition,
          })
        ),
        Match.exhaustive
      );

    const registry = makeCommandRegistry(commands, commandMatcher);

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
      invalidCommand,
      registry.dispatch,
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
    const commands = [createUserCommand] as const;

    type Commands = CommandFromDefinitions<typeof commands>;

    const commandMatcher = (command: ReadonlyDeep<Commands>) =>
      pipe(
        command,
        Match.value,
        Match.when({ name: 'CreateUser' }, () =>
          Effect.succeed({
            _tag: 'Success' as const,
            position: { streamId: 'user-123', eventNumber: 1 } as EventStreamPosition,
          })
        ),
        Match.exhaustive
      );

    const registry = makeCommandRegistry(commands, commandMatcher);

    const unknownCommand: WireCommand = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'UnknownCommand',
      payload: {},
    };

    return pipe(
      unknownCommand,
      registry.dispatch,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error._tag).toBe('ValidationError');
            if (result.error._tag === 'ValidationError') {
              expect(result.error.commandName).toBe('UnknownCommand');
              expect(result.error.validationErrors.length).toBeGreaterThan(0);
            }
          }
        })
      )
    );
  });

  it.effect('should handle command execution errors', () => {
    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const commands = [createUserCommand] as const;

    type Commands = CommandFromDefinitions<typeof commands>;

    const commandMatcher = (command: ReadonlyDeep<Commands>) =>
      pipe(
        command,
        Match.value,
        Match.when({ name: 'CreateUser' }, () => Effect.die(new Error('Something went wrong'))),
        Match.exhaustive
      );

    const registry = makeCommandRegistry(commands, commandMatcher);

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
      wireCommand,
      registry.dispatch,
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
      newEmail: pipe(Schema.String, Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    });

    const createUserCommand = defineCommand('CreateUser', UserPayload);
    const updateEmailCommand = defineCommand('UpdateEmail', UpdateEmailPayload);
    const commands = [createUserCommand, updateEmailCommand] as const;

    type Commands = CommandFromDefinitions<typeof commands>;

    const commandMatcher = (command: ReadonlyDeep<Commands>) =>
      pipe(
        command,
        Match.value,
        Match.when({ name: 'CreateUser' }, () =>
          Effect.succeed({
            _tag: 'Success' as const,
            position: { streamId: 'user-123', eventNumber: 1 } as EventStreamPosition,
          })
        ),
        Match.when({ name: 'UpdateEmail' }, () =>
          Effect.succeed({
            _tag: 'Success' as const,
            position: { streamId: 'user-123', eventNumber: 2 } as EventStreamPosition,
          })
        ),
        Match.exhaustive
      );

    const registry = makeCommandRegistry(commands, commandMatcher);

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
      [registry.dispatch(createCommand), registry.dispatch(updateCommand)] as const,
      Effect.all,
      Effect.tap((results) =>
        Effect.sync(() => {
          expect(results[0]._tag).toBe('Success');
          expect(results[1]._tag).toBe('Success');
        })
      )
    );
  });
});
