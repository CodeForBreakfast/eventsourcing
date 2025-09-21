import { Effect, Layer, pipe, Stream } from 'effect';
import { describe, expect, it } from 'bun:test';
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
  id: string;
  type: string;
  data: unknown;
}

interface UserProjection {
  id: string;
  name: string;
  email: string;
}

interface AggregateSnapshot {
  version: number;
  state: unknown;
}

describe('Service Definitions', () => {
  describe('EventStoreService', () => {
    it('should create a valid service tag', () => {
      // Effect.Tag doesn't expose _tag directly, but we can verify it's a valid tag
      expect(EventStoreService).toBeDefined();
      expect(typeof EventStoreService).toBe('function');
    });

    it('should work with dependency injection', async () => {
      const mockEventStore: EventStoreServiceInterface<string> = {
        write: () => {
          throw new Error('Not implemented');
        },
        read: (from) => Effect.fail(eventStoreError.read(from.streamId, 'Not implemented')),
        readHistorical: (from) =>
          Effect.fail(eventStoreError.read(from.streamId, 'Not implemented')),
      };

      // For string events, we'll use the base untyped service
      const EventStoreLive = Layer.succeed(
        EventStoreService,
        mockEventStore as EventStoreServiceInterface<unknown>
      );

      const program = pipe(
        EventStoreService,
        Effect.flatMap((store) => store.read({ streamId: 'test' as EventStreamId })),
        Effect.catchTag('EventStoreError', (error) => Effect.succeed(`Caught: ${error.details}`))
      );

      const result = await pipe(program, Effect.provide(EventStoreLive), Effect.runPromise);

      expect(result).toBe('Caught: Not implemented');
    });

    it('should support typed event stores', async () => {
      // MyEvent type is already defined at the top of the file
      const mockEventStore: EventStoreServiceInterface<MyEvent> = {
        write: () => {
          throw new Error('Not implemented');
        },
        read: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
        readHistorical: () => Effect.succeed(Stream.empty as Stream.Stream<MyEvent, never>),
      };

      const EventStoreLive = Layer.succeed(MyEventStoreService, mockEventStore);

      const program = pipe(
        MyEventStoreService,
        Effect.flatMap((store) =>
          store.read({
            streamId: 'test' as EventStreamId,
            eventNumber: 0,
          } as EventStreamPosition)
        ),
        Effect.map(() => 'Success')
      );

      const result = await pipe(program, Effect.provide(EventStoreLive), Effect.runPromise);

      expect(result).toBe('Success');
    });
  });

  describe('ProjectionStoreService', () => {
    it('should create a valid service tag', () => {
      expect(ProjectionStoreService).toBeDefined();
      expect(typeof ProjectionStoreService).toBe('function');
    });

    it('should work with dependency injection', async () => {
      // UserProjection type is already defined at the top of the file
      const mockProjectionStore: ProjectionStoreServiceInterface<UserProjection> = {
        get: (id) =>
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
      };

      const ProjectionStoreLive = Layer.succeed(UserProjectionStoreService, mockProjectionStore);

      const program = pipe(
        UserProjectionStoreService,
        Effect.flatMap((store) => store.get('user-1')),
        Effect.map((user) => user?.name ?? 'Not found')
      );

      const result = await pipe(program, Effect.provide(ProjectionStoreLive), Effect.runPromise);

      expect(result).toBe('John');
    });
  });

  describe('SnapshotStoreService', () => {
    it('should create a valid service tag', () => {
      expect(SnapshotStoreService).toBeDefined();
      expect(typeof SnapshotStoreService).toBe('function');
    });

    it('should work with dependency injection', async () => {
      // AggregateSnapshot type is already defined at the top of the file, but we'll use a more specific one
      const mockSnapshotStore: SnapshotStoreServiceInterface<AggregateSnapshot> = {
        save: () => Effect.succeed(undefined),
        load: (aggregateId, version) =>
          aggregateId === 'agg-1'
            ? Effect.succeed({
                version: version ?? 10,
                snapshot: { version: 10, state: { active: true } },
              })
            : Effect.succeed(null),
        delete: () => Effect.succeed(undefined),
        list: () => Effect.succeed([1, 5, 10]),
      };

      const SnapshotStoreLive = Layer.succeed(AggregateSnapshotStoreService, mockSnapshotStore);

      const program = pipe(
        AggregateSnapshotStoreService,
        Effect.flatMap((store) => store.load('agg-1')),
        Effect.map((result) => result?.snapshot.version ?? 0)
      );

      const result = await pipe(program, Effect.provide(SnapshotStoreLive), Effect.runPromise);

      expect(result).toBe(10);
    });
  });

  describe('Service composition', () => {
    it('should allow combining multiple services', async () => {
      const EventStoreLive = Layer.succeed(EventStoreService, {
        write: () => {
          throw new Error('Not implemented');
        },
        read: () => Effect.fail(eventStoreError.read(undefined, 'Not implemented')),
        readHistorical: () => Effect.fail(eventStoreError.read(undefined, 'Not implemented')),
      } as EventStoreServiceInterface<unknown>);

      const ProjectionStoreLive = Layer.succeed(ProjectionStoreService, {
        get: () => Effect.succeed(null),
        save: () => Effect.succeed(undefined),
        delete: () => Effect.succeed(undefined),
        list: () => Effect.succeed([]),
        clear: () => Effect.succeed(undefined),
      } as ProjectionStoreServiceInterface<unknown>);

      const SnapshotStoreLive = Layer.succeed(SnapshotStoreService, {
        save: () => Effect.succeed(undefined),
        load: () => Effect.succeed(null),
        delete: () => Effect.succeed(undefined),
        list: () => Effect.succeed([]),
      } as SnapshotStoreServiceInterface<unknown>);

      const AllServicesLive = Layer.mergeAll(
        EventStoreLive,
        ProjectionStoreLive,
        SnapshotStoreLive
      );

      const program = Effect.gen(function* () {
        const eventStore = yield* EventStoreService;
        const projectionStore = yield* ProjectionStoreService;
        const snapshotStore = yield* SnapshotStoreService;

        // All services should be available
        expect(eventStore).toBeDefined();
        expect(projectionStore).toBeDefined();
        expect(snapshotStore).toBeDefined();

        return 'All services available';
      });

      const result = await pipe(program, Effect.provide(AllServicesLive), Effect.runPromise);

      expect(result).toBe('All services available');
    });
  });
});
