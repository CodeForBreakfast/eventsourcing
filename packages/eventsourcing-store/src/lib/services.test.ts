import { Effect, Layer, pipe, Stream, Context } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect';
import { EventStreamId, EventStreamPosition } from './streamTypes';
import type { EventStore, ProjectionStore, SnapshotStore } from './services';
import { eventStoreError } from './errors';

// Test-specific typed service tags
const MyEventStoreService = Context.GenericTag<EventStore<MyEvent>, EventStore<MyEvent>>(
  'MyEventStore'
);
const UserProjectionStoreService = Context.GenericTag<
  ProjectionStore<UserProjection>,
  ProjectionStore<UserProjection>
>('UserProjectionStore');
const AggregateSnapshotStoreService = Context.GenericTag<
  SnapshotStore<AggregateSnapshot>,
  SnapshotStore<AggregateSnapshot>
>('AggregateSnapshotStore');

// Also create generic versions for the generic tests
const EventStoreService = Context.GenericTag<EventStore<unknown>, EventStore<unknown>>(
  'EventStore'
);
const ProjectionStoreService = Context.GenericTag<
  ProjectionStore<unknown>,
  ProjectionStore<unknown>
>('ProjectionStore');
const SnapshotStoreService = Context.GenericTag<SnapshotStore<unknown>, SnapshotStore<unknown>>(
  'SnapshotStore'
);

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
      // GenericTag factory returns an object with tag methods
      expect(EventStoreService).toBeDefined();
      expect(typeof EventStoreService).toBe('object');
    });

    const createTestEventStreamPosition = (): EventStreamPosition => ({
      streamId: 'test' as EventStreamId,
      eventNumber: 0,
    });

    const testEventStoreErrorCatching = () =>
      pipe(
        EventStoreService,
        Effect.flatMap((store) => store.read(createTestEventStreamPosition())),
        Effect.catchTag('EventStoreError', (error) =>
          Effect.succeed(`Caught error: ${error.message}`)
        ),
        Effect.map((result) => {
          expect(result).toContain('Caught error:');
        })
      );

    const createReadError = (streamId: string | undefined) =>
      pipe(undefined, eventStoreError.read(streamId, 'Not implemented'));

    const failWithReadError = (streamId: string | undefined) =>
      Effect.fail(createReadError(streamId));

    pipe(
      Layer.succeed(EventStoreService, {
        append: () => {
          throw new Error('Not implemented');
        },
        read: (from: EventStreamPosition) => failWithReadError(from.streamId),
        subscribe: (from: EventStreamPosition) => failWithReadError(from.streamId),
      } as EventStore<unknown>),
      it.layer,
      (layeredIt) =>
        layeredIt('should work with dependency injection', (it) => {
          it.effect(
            'can handle dependency injection and error catching',
            testEventStoreErrorCatching
          );
        })
    );

    const testTypedEventStore = () =>
      pipe(
        MyEventStoreService,
        Effect.flatMap((store) => store.read(createTestEventStreamPosition())),
        Effect.as('Success'),
        Effect.map((result) => {
          expect(result).toBe('Success');
        })
      );

    pipe(
      Layer.succeed(MyEventStoreService, {
        append: () => {
          throw new Error('Not implemented');
        },
        read: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
        subscribe: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
      } as EventStore<MyEvent>),
      it.layer,
      (layeredIt) =>
        layeredIt('should support typed event stores', (it) => {
          it.effect('can work with typed events', testTypedEventStore);
        })
    );
  });

  describe('ProjectionStoreService', () => {
    it('should create a valid service tag', () => {
      expect(ProjectionStoreService).toBeDefined();
      expect(typeof ProjectionStoreService).toBe('object');
    });

    const testUserProjectionGet = () =>
      pipe(
        UserProjectionStoreService,
        Effect.flatMap((store) => store.get('user-1')),
        Effect.map((user) => user?.name ?? 'Not found'),
        Effect.map((result) => {
          expect(result).toBe('John');
        })
      );

    pipe(
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
      } as ProjectionStore<UserProjection>),
      it.layer,
      (layeredIt) =>
        layeredIt('should work with dependency injection', (it) => {
          it.effect('can get user projections', testUserProjectionGet);
        })
    );
  });

  describe('SnapshotStoreService', () => {
    it('should create a valid service tag', () => {
      expect(SnapshotStoreService).toBeDefined();
      expect(typeof SnapshotStoreService).toBe('object');
    });

    const testSnapshotLoad = () =>
      pipe(
        AggregateSnapshotStoreService,
        Effect.flatMap((store) => store.load('agg-1')),
        Effect.map((result) => result?.snapshot.version ?? 0),
        Effect.map((result) => {
          expect(result).toBe(10);
        })
      );

    pipe(
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
      } as SnapshotStore<AggregateSnapshot>),
      it.layer,
      (layeredIt) =>
        layeredIt('should work with dependency injection', (it) => {
          it.effect('can load aggregate snapshots', testSnapshotLoad);
        })
    );
  });

  describe('Service composition', () => {
    const testAllServicesAvailable = () =>
      pipe(
        [EventStoreService, ProjectionStoreService, SnapshotStoreService],
        Effect.all,
        Effect.map(([eventStore, projectionStore, snapshotStore]) => {
          expect(eventStore).toBeDefined();
          expect(projectionStore).toBeDefined();
          expect(snapshotStore).toBeDefined();
          return 'All services available';
        }),
        Effect.map((result) => {
          expect(result).toBe('All services available');
        })
      );

    const createUndefinedReadError = () =>
      pipe(undefined, eventStoreError.read(undefined, 'Not implemented'));

    const failWithUndefinedReadError = () => Effect.fail(createUndefinedReadError());

    pipe(
      Layer.mergeAll(
        Layer.succeed(EventStoreService, {
          append: () => {
            throw new Error('Not implemented');
          },
          read: failWithUndefinedReadError,
          subscribe: failWithUndefinedReadError,
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
      ),
      it.layer,
      (layeredIt) =>
        layeredIt('should allow combining multiple services', (it) => {
          it.effect('can access all services simultaneously', testAllServicesAvailable);
        })
    );
  });
});
