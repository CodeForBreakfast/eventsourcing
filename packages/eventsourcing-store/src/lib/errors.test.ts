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
      expect(pipe(undefined, eventStoreError.write('stream-1', 'Write failed'))).toBeInstanceOf(
        EventStoreError
      );

      expect(
        isEventSourcingError(pipe(new Error('failed'), connectionError.fatal('connect')))
      ).toBe(true);
    });
  });

  describe('EventStoreConnectionError', () => {
    it('should distinguish retryable and fatal errors', () => {
      expect(pipe(new Error('timeout'), connectionError.retryable('connect')).retryable).toBe(true);
      expect(pipe(new Error('invalid config'), connectionError.fatal('connect')).retryable).toBe(
        false
      );
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
      [
        pipe(undefined, eventStoreError.read('stream-1', 'Not found')),
        pipe(undefined, eventStoreError.write('stream-2', 'Locked')),
        pipe(undefined, eventStoreError.subscribe('stream-3', 'No permission')),
      ].forEach((error) => {
        expect(error).toBeInstanceOf(EventStoreError);
        expect(error.recoveryHint).toBeDefined();
      });
    });
  });

  describe('Type guards', () => {
    it('should identify all event sourcing errors', () => {
      [
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
      ].forEach((error) => {
        expect(isEventSourcingError(error)).toBe(true);
      });

      expect(isEventSourcingError(new Error('regular error'))).toBe(false);
      expect(isEventSourcingError(null)).toBe(false);
      expect(isEventSourcingError(undefined)).toBe(false);
    });
  });

  describe('Error serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const deserialized = JSON.parse(
        JSON.stringify(
          new EventStoreError({
            operation: 'write',
            streamId: 'test-stream',
            details: 'Write failed',
            cause: { message: 'DB error' },
            recoveryHint: 'Retry later',
          })
        )
      ) as {
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
      pipe(
        new EventStoreError({
          operation: 'read',
          streamId: 'test-stream',
          details: 'test details',
        }),
        (error) => {
          expect(error).toBeInstanceOf(EventStoreError);
          expect(error.operation).toBe('read');
          expect(error.streamId).toBe('test-stream');
          expect(error.details).toBe('test details');
        }
      );
    });

    it('should create error with write operation', () => {
      pipe(
        new EventStoreError({
          operation: 'write',
          streamId: 'test-stream',
          details: 'test details',
        }),
        (error) => {
          expect(error).toBeInstanceOf(EventStoreError);
          expect(error.operation).toBe('write');
          expect(error.streamId).toBe('test-stream');
          expect(error.details).toBe('test details');
        }
      );
    });

    it('should create error with subscribe operation', () => {
      pipe(
        new EventStoreError({
          operation: 'subscribe',
          streamId: 'test-stream',
          details: 'test details',
        }),
        (error) => {
          expect(error).toBeInstanceOf(EventStoreError);
          expect(error.operation).toBe('subscribe');
          expect(error.streamId).toBe('test-stream');
          expect(error.details).toBe('test details');
        }
      );
    });
  });
});
