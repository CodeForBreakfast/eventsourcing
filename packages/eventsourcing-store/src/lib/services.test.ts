import { Effect, Layer, pipe, Stream } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/buntest';
import { EventStreamId, EventStreamPosition } from './streamTypes';
import type { EventStore, ProjectionStore, SnapshotStore } from './services';
import { EventStoreService, ProjectionStoreService, SnapshotStoreService } from './services';
import { eventStoreError } from './errors';

// Test-specific typed service tags
class MyEventStoreService extends Effect.Tag('TestEventStore')<
  MyEventStoreService,
  EventStore<MyEvent>
>() {}

class UserProjectionStoreService extends Effect.Tag('TestProjectionStore')<
  UserProjectionStoreService,
  ProjectionStore<UserProjection>
>() {}

class AggregateSnapshotStoreService extends Effect.Tag('TestSnapshotStore')<
  AggregateSnapshotStoreService,
  SnapshotStore<AggregateSnapshot>
>() {}

// Test types
interface MyEvent {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}

interface UserProjection {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

interface AggregateSnapshot {
  readonly version: number;
  readonly state: unknown;
}

describe('Service Definitions', () => {
  describe('EventStoreService', () => {
    it('should create a valid service tag', () => {
      // Effect.Tag doesn't expose _tag directly, but we can verify it's a valid tag
      expect(EventStoreService).toBeDefined();
      expect(typeof EventStoreService).toBe('function');
    });

    it.layer(
      Layer.succeed(EventStoreService, {
        append: () => {
          throw new Error('Not implemented');
        },
        read: (from: EventStreamPosition) =>
          Effect.fail(eventStoreError.read(from.streamId, 'Not implemented')),
        subscribe: (from: EventStreamPosition) =>
          Effect.fail(eventStoreError.read(from.streamId, 'Not implemented')),
      } as EventStore<unknown>)
    )('should work with dependency injection', (it) => {
      it.effect('can handle dependency injection and error catching', () =>
        pipe(
          EventStoreService,
          Effect.flatMap((store) =>
            store.read({
              streamId: 'test' as EventStreamId,
              eventNumber: 0,
            } as EventStreamPosition)
          ),
          Effect.catchTag('EventStoreError', (error) =>
            Effect.succeed(`Caught error: ${error.message}`)
          ),
          Effect.map((result) => {
            expect(result).toContain('Caught error:');
          })
        )
      );
    });

    it.layer(
      Layer.succeed(MyEventStoreService, {
        append: () => {
          throw new Error('Not implemented');
        },
        read: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
        subscribe: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
      } as EventStore<MyEvent>)
    )('should support typed event stores', (it) => {
      it.effect('can work with typed events', () =>
        pipe(
          MyEventStoreService,
          Effect.flatMap((store) =>
            store.read({
              streamId: 'test' as EventStreamId,
              eventNumber: 0,
            } as EventStreamPosition)
          ),
          Effect.map(() => 'Success'),
          Effect.map((result) => {
            expect(result).toBe('Success');
          })
        )
      );
    });
  });

  describe('ProjectionStoreService', () => {
    it('should create a valid service tag', () => {
      expect(ProjectionStoreService).toBeDefined();
      expect(typeof ProjectionStoreService).toBe('function');
    });

    it.layer(
      Layer.succeed(UserProjectionStoreService, {
        get: (id: string) =>
          id === 'user-1'
            ? Effect.succeed({
                id: 'user-1',
                name: 'John',
                email: 'john@example.com',
              })
            : Effect.succeed(null),
        save: () => Effect.succeed(undefined),
        delete: () => Effect.succeed(undefined),
        list: () => Effect.succeed(['user-1', 'user-2']),
        clear: () => Effect.succeed(undefined),
      } as ProjectionStore<UserProjection>)
    )('should work with dependency injection', (it) => {
      it.effect('can get user projections', () =>
        pipe(
          UserProjectionStoreService,
          Effect.flatMap((store) => store.get('user-1')),
          Effect.map((user) => user?.name ?? 'Not found'),
          Effect.map((result) => {
            expect(result).toBe('John');
          })
        )
      );
    });
  });

  describe('SnapshotStoreService', () => {
    it('should create a valid service tag', () => {
      expect(SnapshotStoreService).toBeDefined();
      expect(typeof SnapshotStoreService).toBe('function');
    });

    it.layer(
      Layer.succeed(AggregateSnapshotStoreService, {
        save: () => Effect.succeed(undefined),
        load: (aggregateId: string, version?: number) =>
          aggregateId === 'agg-1'
            ? Effect.succeed({
                version: version ?? 10,
                snapshot: { version: 10, state: { active: true } },
              })
            : Effect.succeed(null),
        delete: () => Effect.succeed(undefined),
        list: () => Effect.succeed([1, 5, 10]),
      } as SnapshotStore<AggregateSnapshot>)
    )('should work with dependency injection', (it) => {
      it.effect('can load aggregate snapshots', () =>
        pipe(
          AggregateSnapshotStoreService,
          Effect.flatMap((store) => store.load('agg-1')),
          Effect.map((result) => result?.snapshot.version ?? 0),
          Effect.map((result) => {
            expect(result).toBe(10);
          })
        )
      );
    });
  });

  describe('Service composition', () => {
    it.layer(
      Layer.mergeAll(
        Layer.succeed(EventStoreService, {
          append: () => {
            throw new Error('Not implemented');
          },
          read: () => Effect.fail(eventStoreError.read(undefined, 'Not implemented')),
          subscribe: () => Effect.fail(eventStoreError.read(undefined, 'Not implemented')),
        } as EventStore<unknown>),
        Layer.succeed(ProjectionStoreService, {
          get: () => Effect.succeed(null),
          save: () => Effect.succeed(undefined),
          delete: () => Effect.succeed(undefined),
          list: () => Effect.succeed([]),
          clear: () => Effect.succeed(undefined),
        } as ProjectionStore<unknown>),
        Layer.succeed(SnapshotStoreService, {
          save: () => Effect.succeed(undefined),
          load: () => Effect.succeed(null),
          delete: () => Effect.succeed(undefined),
          list: () => Effect.succeed([]),
        } as SnapshotStore<unknown>)
      )
    )('should allow combining multiple services', (it) => {
      it.effect('can access all services simultaneously', () =>
        pipe(
          Effect.all([EventStoreService, ProjectionStoreService, SnapshotStoreService]),
          Effect.map(([eventStore, projectionStore, snapshotStore]) => {
            // All services should be available
            expect(eventStore).toBeDefined();
            expect(projectionStore).toBeDefined();
            expect(snapshotStore).toBeDefined();
            return 'All services available';
          }),
          Effect.map((result) => {
            expect(result).toBe('All services available');
          })
        )
      );
    });
  });
});
