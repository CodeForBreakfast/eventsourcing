import { describe, test, expect } from '@codeforbreakfast/buntest';
import { Schema, Effect, pipe } from 'effect';
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

      const result = pipe(validCommand, Schema.decodeUnknownEither(WireCommand));
      expect(result._tag).toBe('Right');
    });

    test('should reject invalid wire command', () => {
      const invalidCommand = {
        id: 'cmd-123',
        // missing target
        name: 'CreateUser',
        payload: { email: 'test@example.com' },
      };

      const result = pipe(invalidCommand, Schema.decodeUnknownEither(WireCommand));
      expect(result._tag).toBe('Left');
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

      const result = pipe(commandWithComplexPayload, Schema.decodeUnknownEither(WireCommand));
      expect(result._tag).toBe('Right');
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

      const result = pipe(successResult, Schema.decodeUnknownEither(CommandResult));
      expect(result._tag).toBe('Right');
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

      const result = pipe(failureResult, Schema.decodeUnknownEither(CommandResult));
      expect(result._tag).toBe('Right');
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

      const result = pipe(failureResult, Schema.decodeUnknownEither(CommandResult));
      expect(result._tag).toBe('Right');
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

      const result = await pipe(validateCommand(UserPayload)(wireCommand), Effect.runPromise);

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
        validateCommand(UserPayload)(wireCommand),
        Effect.either,
        Effect.runPromise
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CommandValidationError);
        const validationError = result.left as CommandValidationError;
        expect(validationError.commandId).toBe('cmd-123');
        expect(validationError.commandName).toBe('CreateUser');
        expect(validationError.validationErrors.length).toBeGreaterThan(0);
      }
    });
  });
});
