/**
 * Type Safety Tests
 *
 * These tests demonstrate the improved type safety and proper error handling
 * of the new command system vs the old Schema.Unknown approach
 */

import { describe, test, expect } from 'bun:test';
import { Effect, Schema, pipe } from 'effect';
import {
  createCommandSchema,
  validateCommand,
  WireCommand,
  DomainCommand,
  CommandValidationError,
  CommandHandler,
  CommandResult,
} from './commands';
import { CommandRegistryLive, registerCommand, dispatchCommand } from './command-registry';

// ============================================================================
// Test Setup - Define Type-Safe Commands
// ============================================================================

const CreateUserPayload = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.pipe(Schema.minLength(1)),
  age: Schema.optional(Schema.Number.pipe(Schema.between(18, 100))),
});

const UpdateProfilePayload = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  bio: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
  preferences: Schema.optional(
    Schema.Struct({
      theme: Schema.Union(Schema.Literal('light'), Schema.Literal('dark')),
      notifications: Schema.Boolean,
    })
  ),
});

// Mock position for tests
const mockPosition = { streamId: 'test-123' as any, eventNumber: 1 };

const createUserHandler: CommandHandler<DomainCommand<typeof CreateUserPayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: mockPosition,
    }),
};

const updateProfileHandler: CommandHandler<DomainCommand<typeof UpdateProfilePayload.Type>> = {
  handle: (command) =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: mockPosition,
    }),
};

// ============================================================================
// Type Safety Tests
// ============================================================================

describe('Command Type Safety Improvements', () => {
  describe('Schema Validation at Boundaries', () => {
    test('should validate command payload at wire-to-domain boundary', async () => {
      const validateCreateUser = validateCommand(CreateUserPayload);

      // Valid command should pass validation
      const validWireCommand: WireCommand = {
        id: 'cmd-123',
        target: 'user-456',
        name: 'CreateUser',
        payload: {
          email: 'alice@example.com',
          name: 'Alice Smith',
          age: 25,
        },
      };

      const validResult = await Effect.runPromise(
        pipe(validWireCommand, validateCreateUser, Effect.either)
      );

      expect(validResult._tag).toBe('Right');
      if (validResult._tag === 'Right') {
        expect(validResult.right.payload.email).toBe('alice@example.com');
        expect(validResult.right.payload.name).toBe('Alice Smith');
        expect(validResult.right.payload.age).toBe(25);
      }
    });

    test('should reject invalid command payload with detailed errors', async () => {
      const validateCreateUser = validateCommand(CreateUserPayload);

      // Invalid command should fail validation
      const invalidWireCommand: WireCommand = {
        id: 'cmd-456',
        target: 'user-789',
        name: 'CreateUser',
        payload: {
          email: 'invalid-email', // Invalid email format
          name: '', // Empty name (too short)
          age: 150, // Age out of range
        },
      };

      const invalidResult = await Effect.runPromise(
        pipe(invalidWireCommand, validateCreateUser, Effect.either)
      );

      expect(invalidResult._tag).toBe('Left');
      if (invalidResult._tag === 'Left') {
        expect(invalidResult.left).toBeInstanceOf(CommandValidationError);
        expect(invalidResult.left.commandId).toBe('cmd-456');
        expect(invalidResult.left.commandName).toBe('CreateUser');
        expect(invalidResult.left.validationErrors.length).toBeGreaterThan(0);
      }
    });

    test('should handle optional fields correctly', async () => {
      const validateCreateUser = validateCommand(CreateUserPayload);

      // Command without optional age field
      const commandWithoutAge: WireCommand = {
        id: 'cmd-789',
        target: 'user-101',
        name: 'CreateUser',
        payload: {
          email: 'bob@example.com',
          name: 'Bob Johnson',
          // age is optional, so omitting it should be fine
        },
      };

      const result = await Effect.runPromise(
        pipe(commandWithoutAge, validateCreateUser, Effect.either)
      );

      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right.payload.age).toBeUndefined();
        expect(result.right.payload.email).toBe('bob@example.com');
      }
    });
  });

  describe('Command Registry Type Safety', () => {
    test('should register and dispatch commands with full type safety', async () => {
      const program = pipe(
        Effect.all([
          registerCommand('CreateUser', CreateUserPayload, createUserHandler),
          registerCommand('UpdateProfile', UpdateProfilePayload, updateProfileHandler),
        ]),
        Effect.flatMap(() => {
          const validCommand: WireCommand = {
            id: 'test-cmd-1',
            target: 'user-123',
            name: 'CreateUser',
            payload: {
              email: 'test@example.com',
              name: 'Test User',
              age: 30,
            },
          };

          return dispatchCommand(validCommand);
        })
      );

      const result = await Effect.runPromise(pipe(program, Effect.provide(CommandRegistryLive)));

      expect(result._tag).toBe('Success');
      if (result._tag === 'Success') {
        expect(result.position).toEqual(mockPosition);
      }
    });

    test('should return proper error for unregistered commands', async () => {
      const program = pipe(
        Effect.all([registerCommand('CreateUser', CreateUserPayload, createUserHandler)]),
        Effect.flatMap(() => {
          const unregisteredCommand: WireCommand = {
            id: 'test-cmd-2',
            target: 'user-456',
            name: 'DeleteUser', // This command is not registered
            payload: {
              reason: 'Account closed',
            },
          };

          return dispatchCommand(unregisteredCommand);
        })
      );

      const result = await Effect.runPromise(pipe(program, Effect.provide(CommandRegistryLive)));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.error._tag).toBe('HandlerNotFound');
        if (result.error._tag === 'HandlerNotFound') {
          expect(result.error.commandName).toBe('DeleteUser');
          expect(result.error.availableHandlers).toContain('CreateUser');
        }
      }
    });

    test('should return validation errors for malformed payloads', async () => {
      const program = pipe(
        registerCommand('CreateUser', CreateUserPayload, createUserHandler),
        Effect.flatMap(() => {
          const malformedCommand: WireCommand = {
            id: 'test-cmd-3',
            target: 'user-789',
            name: 'CreateUser',
            payload: {
              email: 'not-an-email',
              name: '',
              age: -5,
            },
          };

          return dispatchCommand(malformedCommand);
        })
      );

      const result = await Effect.runPromise(pipe(program, Effect.provide(CommandRegistryLive)));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.error._tag).toBe('ValidationError');
        if (result.error._tag === 'ValidationError') {
          expect(result.error.commandId).toBe('test-cmd-3');
          expect(result.error.validationErrors.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Complex Payload Validation', () => {
    test('should handle nested object validation', async () => {
      const validateProfile = validateCommand(UpdateProfilePayload);

      const complexCommand: WireCommand = {
        id: 'complex-cmd-1',
        target: 'user-999',
        name: 'UpdateProfile',
        payload: {
          name: 'Updated Name',
          bio: 'This is my updated bio',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
      };

      const result = await Effect.runPromise(pipe(complexCommand, validateProfile, Effect.either));

      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right.payload.preferences?.theme).toBe('dark');
        expect(result.right.payload.preferences?.notifications).toBe(true);
      }
    });

    test('should reject invalid nested values', async () => {
      const validateProfile = validateCommand(UpdateProfilePayload);

      const invalidNestedCommand: WireCommand = {
        id: 'invalid-nested-cmd',
        target: 'user-888',
        name: 'UpdateProfile',
        payload: {
          preferences: {
            theme: 'purple', // Invalid theme value
            notifications: 'maybe', // Should be boolean
          },
        },
      };

      const result = await Effect.runPromise(
        pipe(invalidNestedCommand, validateProfile, Effect.either)
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CommandValidationError);
      }
    });
  });

  describe('Performance and Error Messaging', () => {
    test('should provide detailed error messages for debugging', async () => {
      const program = pipe(
        registerCommand('CreateUser', CreateUserPayload, createUserHandler),
        Effect.flatMap(() => {
          const badCommand: WireCommand = {
            id: 'debug-cmd-1',
            target: 'user-debug',
            name: 'CreateUser',
            payload: {
              email: 'bad-email-format',
              name: '',
              age: 'not-a-number', // Wrong type
            },
          };

          return dispatchCommand(badCommand);
        })
      );

      const result = await Effect.runPromise(pipe(program, Effect.provide(CommandRegistryLive)));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure' && result.error._tag === 'ValidationError') {
        // Errors should contain helpful information for debugging
        expect(result.error.commandId).toBe('debug-cmd-1');
        expect(result.error.commandName).toBe('CreateUser');
        expect(result.error.validationErrors.length).toBeGreaterThan(0);

        // Should contain some reference to the validation that failed
        const errorMessage = result.error.validationErrors.join(' ');
        expect(errorMessage.length).toBeGreaterThan(10); // Should have meaningful content
      }
    });

    test('should handle large payloads efficiently', async () => {
      const BigPayload = Schema.Struct({
        items: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            data: Schema.String,
          })
        ),
      });

      const validateBig = validateCommand(BigPayload);

      // Create a large payload
      const largePayload = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: `item-${i}`,
          data: `data-${i}`.repeat(100),
        })),
      };

      const largeCommand: WireCommand = {
        id: 'large-cmd',
        target: 'bulk-target',
        name: 'BulkProcess',
        payload: largePayload,
      };

      const startTime = Date.now();
      const result = await Effect.runPromise(pipe(largeCommand, validateBig, Effect.either));
      const duration = Date.now() - startTime;

      expect(result._tag).toBe('Right');
      expect(duration).toBeLessThan(100); // Should be fast even with large payloads

      if (result._tag === 'Right') {
        expect(result.right.payload.items.length).toBe(1000);
        expect(result.right.payload.items[0]?.id).toBe('item-0');
      }
    });
  });
});
