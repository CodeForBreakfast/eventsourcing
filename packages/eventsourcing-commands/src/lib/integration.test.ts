import { describe, test, expect } from 'bun:test';
import { Schema } from 'effect';
import { Command, CommandResult } from './commands';
import { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

describe('Commands Integration', () => {
  test('should work with store types', () => {
    // Test that CommandResult integrates properly with EventStreamPosition from store
    const position: EventStreamPosition = {
      streamId: 'user-123' as any, // Branded type from store
      eventNumber: 1,
    };

    const successResult = {
      _tag: 'Success' as const,
      position,
    };

    const result = Schema.decodeUnknownEither(CommandResult)(successResult);
    expect(result._tag).toBe('Right');
  });

  test('should validate command with proper typing', () => {
    const command = {
      id: 'cmd-123',
      target: 'user-456',
      name: 'CreateUser',
      payload: {
        email: 'test@example.com',
        name: 'John Doe',
      },
    };

    const result = Schema.decodeUnknownSync(Command)(command);
    expect(result.id).toBe('cmd-123');
    expect(result.target).toBe('user-456');
    expect(result.name).toBe('CreateUser');
    expect(result.payload).toEqual({
      email: 'test@example.com',
      name: 'John Doe',
    });
  });
});
