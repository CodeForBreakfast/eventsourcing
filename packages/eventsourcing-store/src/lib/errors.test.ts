import { Effect, pipe } from 'effect';

import { describe, expect, it } from 'bun:test';
import {
  EventStoreError,
  EventStoreConnectionError,
  ConcurrencyConflictError,
  ProjectionError,
  SnapshotError,
  WebSocketError,
  eventStoreError,
  connectionError,
  projectionError,
  webSocketError,
  isEventSourcingError,
} from './errors';

// StreamEndMovedError is now an alias for ConcurrencyConflictError
const StreamEndMovedError = ConcurrencyConflictError;

describe('Event Sourcing Errors', () => {
  describe('EventStoreError', () => {
    it('should create error with all fields', () => {
      const error = new EventStoreError({
        operation: 'read',
        streamId: 'test-stream',
        details: 'Failed to read stream',
        cause: new Error('DB error'),
        recoveryHint: 'Check permissions',
      });

      expect(error._tag).toBe('EventStoreError');
      expect(error.operation).toBe('read');
      expect(error.streamId).toBe('test-stream');
      expect(error.details).toBe('Failed to read stream');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.recoveryHint).toBe('Check permissions');
    });

    it('should work with Effect error handling', async () => {
      const program = pipe(
        Effect.fail(eventStoreError.read('stream-1', 'Stream not found')),
        Effect.catchTag('EventStoreError', (error) => Effect.succeed(`Caught: ${error.details}`))
      );

      const result = await Effect.runPromise(program);
      expect(result).toBe('Caught: Stream not found');
    });

    it('should support type guards', () => {
      const error = eventStoreError.write('stream-1', 'Write failed');
      expect(EventStoreError.is(error)).toBe(true);
      expect(EventStoreConnectionError.is(error)).toBe(false);
    });
  });

  describe('EventStoreConnectionError', () => {
    it('should distinguish retryable and fatal errors', () => {
      const retryable = connectionError.retryable('connect', new Error('timeout'));
      const fatal = connectionError.fatal('connect', new Error('invalid config'));

      expect(retryable.retryable).toBe(true);
      expect(fatal.retryable).toBe(false);
    });
  });

  describe('StreamEndMovedError', () => {
    it('should contain version information', () => {
      const error = new StreamEndMovedError({
        streamId: 'test-stream',
        expectedVersion: 5,
        actualVersion: 10,
      });

      expect(error.streamId).toBe('test-stream');
      expect(error.expectedVersion).toBe(5);
      expect(error.actualVersion).toBe(10);
    });
  });

  describe('ProjectionError', () => {
    it('should track event position on failure', () => {
      const error = projectionError.build(
        'user-projection',
        'Handler failed',
        42,
        new Error('parse error')
      );

      expect(error.projectionName).toBe('user-projection');
      expect(error.operation).toBe('build');
      expect(error.eventPosition).toBe(42);
    });
  });

  describe('WebSocketError', () => {
    it('should include connection details', () => {
      const error = webSocketError.connect('ws://localhost:8080', 'Connection refused', 1006);

      expect(error.operation).toBe('connect');
      expect(error.url).toBe('ws://localhost:8080');
      expect(error.code).toBe(1006);
      expect(error.retryable).toBe(true);
    });
  });

  describe('Error helpers', () => {
    it('should provide convenient error creation', () => {
      const errors = [
        eventStoreError.read('stream-1', 'Not found'),
        eventStoreError.write('stream-2', 'Locked'),
        eventStoreError.subscribe('stream-3', 'No permission'),
      ];

      errors.forEach((error) => {
        expect(error._tag).toBe('EventStoreError');
        expect(error.recoveryHint).toBeDefined();
      });
    });
  });

  describe('Type guards', () => {
    it('should identify all event sourcing errors', () => {
      const errors = [
        new EventStoreError({ operation: 'read', details: 'test' }),
        new ProjectionError({
          projectionName: 'test',
          operation: 'build',
          details: 'test',
        }),
        new SnapshotError({
          aggregateId: 'test',
          operation: 'save',
          details: 'test',
        }),
        new WebSocketError({
          operation: 'connect',
          details: 'test',
          retryable: false,
        }),
      ];

      errors.forEach((error) => {
        expect(isEventSourcingError(error)).toBe(true);
      });

      expect(isEventSourcingError(new Error('regular error'))).toBe(false);
      expect(isEventSourcingError(null)).toBe(false);
      expect(isEventSourcingError(undefined)).toBe(false);
    });
  });

  describe('Error serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const error = new EventStoreError({
        operation: 'write',
        streamId: 'test-stream',
        details: 'Write failed',
        cause: { message: 'DB error' },
        recoveryHint: 'Retry later',
      });

      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized) as {
        _tag: string;
        operation: string;
        streamId: string;
      };

      expect(deserialized._tag).toBe('EventStoreError');
      expect(deserialized.operation).toBe('write');
      expect(deserialized.streamId).toBe('test-stream');
    });
  });

  describe('Constructor field assignment', () => {
    it.each(['read', 'write', 'subscribe'] as const)(
      'should create error with %s operation',
      (operation) => {
        const error = new EventStoreError({
          operation,
          streamId: 'test-stream',
          details: 'test details',
        });

        expect(error._tag).toBe('EventStoreError');
        expect(error.operation).toBe(operation);
        expect(error.streamId).toBe('test-stream');
        expect(error.details).toBe('test details');
      }
    );
  });
});
