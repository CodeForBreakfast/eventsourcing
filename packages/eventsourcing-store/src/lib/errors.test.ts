import { Effect, pipe } from 'effect';

import { describe, expect, it } from '@codeforbreakfast/buntest';
import {
  EventStoreError,
  ProjectionError,
  SnapshotError,
  WebSocketError,
  eventStoreError,
  connectionError,
  projectionError,
  webSocketError,
  isEventSourcingError,
} from './errors';

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

      expect(error).toBeInstanceOf(EventStoreError);
      expect(error.operation).toBe('read');
      expect(error.streamId).toBe('test-stream');
      expect(error.details).toBe('Failed to read stream');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.recoveryHint).toBe('Check permissions');
    });

    it.effect('should work with Effect error handling', () =>
      pipe(
        undefined,
        eventStoreError.read('stream-1', 'Stream not found'),
        Effect.fail,
        Effect.catchTag('EventStoreError', (error) => Effect.succeed(`Caught: ${error.details}`)),
        Effect.map((result) => {
          expect(result).toBe('Caught: Stream not found');
        })
      )
    );

    it('should support type guards', () => {
      const error = pipe(undefined, eventStoreError.write('stream-1', 'Write failed'));
      expect(error).toBeInstanceOf(EventStoreError);

      const connError = pipe(new Error('failed'), connectionError.fatal('connect'));
      expect(isEventSourcingError(connError)).toBe(true);
    });
  });

  describe('EventStoreConnectionError', () => {
    it('should distinguish retryable and fatal errors', () => {
      const retryable = pipe(new Error('timeout'), connectionError.retryable('connect'));
      const fatal = pipe(new Error('invalid config'), connectionError.fatal('connect'));

      expect(retryable.retryable).toBe(true);
      expect(fatal.retryable).toBe(false);
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
        pipe(undefined, eventStoreError.read('stream-1', 'Not found')),
        pipe(undefined, eventStoreError.write('stream-2', 'Locked')),
        pipe(undefined, eventStoreError.subscribe('stream-3', 'No permission')),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(EventStoreError);
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
        readonly _tag: string;
        readonly operation: string;
        readonly streamId: string;
      };

      expect(deserialized['_tag']).toBe('EventStoreError');
      expect(deserialized.operation).toBe('write');
      expect(deserialized.streamId).toBe('test-stream');
    });
  });

  describe('Constructor field assignment', () => {
    it('should create error with read operation', () => {
      const error = new EventStoreError({
        operation: 'read',
        streamId: 'test-stream',
        details: 'test details',
      });

      expect(error).toBeInstanceOf(EventStoreError);
      expect(error.operation).toBe('read');
      expect(error.streamId).toBe('test-stream');
      expect(error.details).toBe('test details');
    });

    it('should create error with write operation', () => {
      const error = new EventStoreError({
        operation: 'write',
        streamId: 'test-stream',
        details: 'test details',
      });

      expect(error).toBeInstanceOf(EventStoreError);
      expect(error.operation).toBe('write');
      expect(error.streamId).toBe('test-stream');
      expect(error.details).toBe('test details');
    });

    it('should create error with subscribe operation', () => {
      const error = new EventStoreError({
        operation: 'subscribe',
        streamId: 'test-stream',
        details: 'test details',
      });

      expect(error).toBeInstanceOf(EventStoreError);
      expect(error.operation).toBe('subscribe');
      expect(error.streamId).toBe('test-stream');
      expect(error.details).toBe('test details');
    });
  });
});
