import { describe, test, expect } from 'bun:test';
import { Schema } from 'effect';
import { Command, CommandResult } from './commands';

describe('Commands Package', () => {
  describe('Command Schema', () => {
    test('should validate a valid command', () => {
      const validCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: { email: 'test@example.com' },
      };

      const result = Schema.decodeUnknownEither(Command)(validCommand);
      expect(result._tag).toBe('Right');
    });

    test('should reject invalid command', () => {
      const invalidCommand = {
        id: 'cmd-123',
        // missing target
        name: 'CreateUser',
        payload: { email: 'test@example.com' },
      };

      const result = Schema.decodeUnknownEither(Command)(invalidCommand);
      expect(result._tag).toBe('Left');
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

      const result = Schema.decodeUnknownEither(CommandResult)(successResult);
      expect(result._tag).toBe('Right');
    });

    test('should validate failure result', () => {
      const failureResult = {
        _tag: 'Failure',
        error: 'User already exists',
      };

      const result = Schema.decodeUnknownEither(CommandResult)(failureResult);
      expect(result._tag).toBe('Right');
    });
  });
});
