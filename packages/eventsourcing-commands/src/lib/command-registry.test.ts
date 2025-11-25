import { describe, it, expect } from '@codeforbreakfast/bun-test-effect';
import { Schema, Effect, pipe, Match } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import type { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';
import { WireCommand, defineCommand, CommandFromDefinitions, CommandResult } from './commands';
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

    const assertSuccess = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', (success) => {
          expect(success.position.eventNumber).toBe(1);
        }),
        Match.tag('Failure', () => {
          expect(true).toBe(false);
        }),
        Match.exhaustive
      );

    // Dispatch the command
    return pipe(wireCommand, registry.dispatch, Effect.map(assertSuccess));
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

    type FailureError = Extract<CommandResult, { readonly _tag: 'Failure' }>['error'];

    const assertValidationErrorDetails = (error: ReadonlyDeep<FailureError>) =>
      pipe(
        error,
        Match.value,
        Match.tag('ValidationError', (validationError) => {
          expect(validationError.commandId).toBe('cmd-123');
          expect(validationError.commandName).toBe('CreateUser');
          expect(validationError.validationErrors.length).toBeGreaterThan(0);
        }),
        Match.orElse(() => {
          expect(true).toBe(false);
        })
      );

    const assertValidationError = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', () => {
          expect(true).toBe(false);
        }),
        Match.tag('Failure', (failure) => assertValidationErrorDetails(failure.error)),
        Match.exhaustive
      );

    return pipe(invalidCommand, registry.dispatch, Effect.map(assertValidationError));
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

    type FailureError = Extract<CommandResult, { readonly _tag: 'Failure' }>['error'];

    const assertUnknownCommandErrorDetails = (error: ReadonlyDeep<FailureError>) =>
      pipe(
        error,
        Match.value,
        Match.tag('ValidationError', (validationError) => {
          expect(validationError.commandName).toBe('UnknownCommand');
          expect(validationError.validationErrors.length).toBeGreaterThan(0);
        }),
        Match.orElse(() => {
          expect(true).toBe(false);
        })
      );

    const assertUnknownCommand = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', () => {
          expect(true).toBe(false);
        }),
        Match.tag('Failure', (failure) => assertUnknownCommandErrorDetails(failure.error)),
        Match.exhaustive
      );

    return pipe(unknownCommand, registry.dispatch, Effect.map(assertUnknownCommand));
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

    type FailureError = Extract<CommandResult, { readonly _tag: 'Failure' }>['error'];

    const assertUnknownErrorDetails = (error: ReadonlyDeep<FailureError>) =>
      pipe(
        error,
        Match.value,
        Match.tag('UnknownError', () => {
          expect(true).toBe(true);
        }),
        Match.orElse(() => {
          expect(true).toBe(false);
        })
      );

    const assertUnknownError = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', () => {
          expect(true).toBe(false);
        }),
        Match.tag('Failure', (failure) => assertUnknownErrorDetails(failure.error)),
        Match.exhaustive
      );

    return pipe(wireCommand, registry.dispatch, Effect.map(assertUnknownError));
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

    const assertSuccess0 = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', () => {
          expect(true).toBe(true);
        }),
        Match.tag('Failure', () => {
          expect(true).toBe(false);
        }),
        Match.exhaustive
      );

    const assertSuccess1 = (result: CommandResult) =>
      pipe(
        result,
        Match.value,
        Match.tag('Success', () => {
          expect(true).toBe(true);
        }),
        Match.tag('Failure', () => {
          expect(true).toBe(false);
        }),
        Match.exhaustive
      );

    return pipe(
      [registry.dispatch(createCommand), registry.dispatch(updateCommand)] as const,
      Effect.all,
      Effect.map((results) => {
        assertSuccess0(results[0]);
        assertSuccess1(results[1]);
      })
    );
  });
});
