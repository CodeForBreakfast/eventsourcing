import { describe, test, expect } from '@codeforbreakfast/buntest';
import { Schema, Effect, pipe, Either } from 'effect';
import { WireCommand, CommandResult, validateCommand, CommandValidationError } from './commands';

describe('Wire Commands', () => {
  describe('WireCommand Schema', () => {
    test('should validate a valid wire command', () => {
      const validCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: { email: 'test@example.com' },
      };

      expect(Either.isRight(pipe(validCommand, Schema.decodeUnknownEither(WireCommand)))).toBe(
        true
      );
    });

    test('should reject invalid wire command', () => {
      const invalidCommand = {
        id: 'cmd-123',
        // missing target
        name: 'CreateUser',
        payload: { email: 'test@example.com' },
      };

      expect(Either.isLeft(pipe(invalidCommand, Schema.decodeUnknownEither(WireCommand)))).toBe(
        true
      );
    });

    test('should accept unknown payload types', () => {
      const commandWithComplexPayload = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: {
          nested: { data: 'value' },
          array: [1, 2, 3],
          boolean: true,
        },
      };

      expect(
        Either.isRight(pipe(commandWithComplexPayload, Schema.decodeUnknownEither(WireCommand)))
      ).toBe(true);
    });
  });

  describe('CommandResult Schema', () => {
    test('should validate success result', () => {
      const successResult = {
        _tag: 'Success',
        position: {
          streamId: 'user-456',
          eventNumber: 1,
        },
      };

      expect(Either.isRight(pipe(successResult, Schema.decodeUnknownEither(CommandResult)))).toBe(
        true
      );
    });

    test('should validate validation error', () => {
      const failureResult = {
        _tag: 'Failure',
        error: {
          _tag: 'ValidationError',
          commandId: 'cmd-123',
          commandName: 'CreateUser',
          validationErrors: ['Email is required', 'Name must be at least 1 character'],
        },
      };

      expect(Either.isRight(pipe(failureResult, Schema.decodeUnknownEither(CommandResult)))).toBe(
        true
      );
    });

    test('should validate handler not found error', () => {
      const failureResult = {
        _tag: 'Failure',
        error: {
          _tag: 'HandlerNotFound',
          commandId: 'cmd-123',
          commandName: 'UnknownCommand',
          availableHandlers: ['CreateUser', 'UpdateUser'],
        },
      };

      expect(Either.isRight(pipe(failureResult, Schema.decodeUnknownEither(CommandResult)))).toBe(
        true
      );
    });
  });

  describe('Command Validation', () => {
    const UserPayload = Schema.Struct({
      email: pipe(Schema.String, Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
      name: pipe(Schema.String, Schema.minLength(1)),
      age: Schema.optional(pipe(Schema.Number, Schema.between(13, 120))),
    });

    test('should validate and transform valid payload', async () => {
      const wireCommand: WireCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: {
          email: 'test@example.com',
          name: 'John Doe',
          age: 30,
        },
      };

      const result = await pipe(wireCommand, validateCommand(UserPayload), Effect.runPromise);

      expect(result.id).toBe('cmd-123');
      expect(result.target).toBe('user-456');
      expect(result.name).toBe('CreateUser');
      expect(result.payload.email).toBe('test@example.com');
      expect(result.payload.name).toBe('John Doe');
      expect(result.payload.age).toBe(30);
    });

    test('should fail validation for invalid payload', async () => {
      const wireCommand: WireCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: {
          email: 'invalid-email',
          name: '',
          age: 150,
        },
      };

      const result = await pipe(
        wireCommand,
        validateCommand(UserPayload),
        Effect.either,
        Effect.runPromise
      );

      expect(Either.isLeft(result)).toBe(true);
      pipe(
        result,
        Either.match({
          onLeft: (validationError) => {
            expect(validationError).toBeInstanceOf(CommandValidationError);
            expect(validationError.commandId).toBe('cmd-123');
            expect(validationError.commandName).toBe('CreateUser');
            expect(validationError.validationErrors.length).toBeGreaterThan(0);
          },
          onRight: () => {
            // Should not reach here
          },
        })
      );
    });
  });
});
