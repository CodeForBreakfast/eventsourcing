import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Chunk, Schema, Option, pipe, Layer, Exit } from 'effect';
import type { EventStore } from '@codeforbreakfast/eventsourcing-store';
import {
  makeInMemoryEventStore,
  InMemoryStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import {
  makeAggregateRoot,
  type EventRecord,
  defineAggregateEventStore,
} from './aggregateRootEventStream';
import { provideCommandInitiator } from './commandInitiator';

const TestUserId = pipe(Schema.String, Schema.brand('TestUserId'));
type TestUserId = Schema.Schema.Type<typeof TestUserId>;

const TestAggregateId = pipe(Schema.String, Schema.brand('TestAggregateId'));
type TestAggregateId = Schema.Schema.Type<typeof TestAggregateId>;

interface TestAggregateState {
  readonly value: string;
  readonly count: number;
}

const TestEventCreated = Schema.Struct({
  type: Schema.Literal('TestCreated'),
  data: Schema.Struct({ value: Schema.String }),
});

const TestEventIncremented = Schema.Struct({
  type: Schema.Literal('TestIncremented'),
  data: Schema.Struct({}),
});

const TestEvent = Schema.Union(TestEventCreated, TestEventIncremented);
type TestEvent = Schema.Schema.Type<typeof TestEvent>;

const applyTestEvent =
  (state: Readonly<Option.Option<TestAggregateState>>) =>
  (event: Readonly<TestEvent>): Effect.Effect<TestAggregateState, never> => {
    const current = Option.getOrElse(state, () => ({ value: '', count: 0 }));
    if (event.type === 'TestCreated') {
      return Effect.succeed({ value: event.data.value, count: 0 });
    }
    return Effect.succeed({ ...current, count: current.count + 1 });
  };

const TestAggregateTag = defineAggregateEventStore<TestEvent, TestUserId>('TestAggregate');

const testCommands = {
  create: (value: string) => (): Effect.Effect<readonly TestEvent[]> =>
    Effect.succeed([{ type: 'TestCreated' as const, data: { value } }]),
  increment:
    () =>
    (state: Readonly<Option.Option<TestAggregateState>>): Effect.Effect<readonly TestEvent[]> =>
      Option.match(state, {
        onNone: () => Effect.succeed([]),
        onSome: () => Effect.succeed([{ type: 'TestIncremented' as const, data: {} }]),
      }),
};

const TestAggregateRoot = makeAggregateRoot(
  TestAggregateId,
  TestUserId,
  applyTestEvent,
  TestAggregateTag,
  testCommands
);

const makeTestLayer = () =>
  Layer.effect(
    TestAggregateTag,
    pipe(
      InMemoryStore.make<EventRecord<TestEvent, TestUserId>>(),
      Effect.flatMap(makeInMemoryEventStore)
    )
  );

describe('defineAggregateEventStore', () => {
  it('should create a valid Context.Tag that can be used in Effect operations', () => {
    const tag = defineAggregateEventStore<TestEvent, TestUserId>('TestFactory');
    const mockStore = {} as EventStore<EventRecord<TestEvent, TestUserId>>;

    const program = pipe(
      mockStore,
      Effect.succeed,
      Effect.provideService(tag, mockStore),
      Effect.andThen(tag),
      Effect.map((store) => {
        expect(store).toBe(mockStore);
      })
    );

    return program;
  });

  it('should create distinct tags for different aggregate names', () => {
    const tag1 = defineAggregateEventStore<TestEvent, TestUserId>('Aggregate1');
    const tag2 = defineAggregateEventStore<TestEvent, TestUserId>('Aggregate2');

    expect(tag1).not.toBe(tag2);
  });
});

describe('Aggregate Load', () => {
  const testUserId = 'test-user' as TestUserId;
  const testLayer = Layer.mergeAll(makeTestLayer(), provideCommandInitiator(testUserId));

  it.scoped('should correctly track nextEventNumber after loading aggregate with one event', () => {
    const aggregateId = 'test-agg-1' as TestAggregateId;
    return pipe(
      // Create initial event
      TestAggregateRoot.commands.create('test-value')(),
      Effect.flatMap((events) =>
        TestAggregateRoot.commit({
          id: aggregateId,
          eventNumber: 0,
          events: Chunk.fromIterable(events),
        })
      ),
      // Load the aggregate
      Effect.andThen(() => TestAggregateRoot.load(aggregateId)),
      Effect.map((state) => {
        // After replaying 1 event, nextEventNumber should be 1
        expect(state.nextEventNumber).toBe(1);
        expect(Option.isSome(state.data)).toBe(true);
        Option.match(state.data, {
          onNone: () => {
            throw new Error('Expected state to be Some');
          },
          onSome: (value) => {
            expect(value.value).toBe('test-value');
            expect(value.count).toBe(0);
          },
        });
      }),
      Effect.provide(testLayer)
    );
  });

  it.scoped(
    'should correctly track nextEventNumber after loading aggregate with multiple events',
    () => {
      const aggregateId = 'test-agg-2' as TestAggregateId;

      const incrementAndCommit = (
        state: Readonly<{
          readonly nextEventNumber: number;
          readonly data: Option.Option<TestAggregateState>;
        }>
      ) => {
        const commandEffect = TestAggregateRoot.commands.increment()(state.data);
        return pipe(
          commandEffect,
          Effect.flatMap((events) =>
            TestAggregateRoot.commit({
              id: aggregateId,
              eventNumber: state.nextEventNumber,
              events: Chunk.fromIterable(events),
            })
          )
        );
      };

      return pipe(
        // Create initial event
        TestAggregateRoot.commands.create('test-value')(),
        Effect.flatMap((events) =>
          TestAggregateRoot.commit({
            id: aggregateId,
            eventNumber: 0,
            events: Chunk.fromIterable(events),
          })
        ),
        // Load and increment
        Effect.andThen(() => TestAggregateRoot.load(aggregateId)),
        Effect.flatMap(incrementAndCommit),
        // Load again
        Effect.andThen(() => TestAggregateRoot.load(aggregateId)),
        Effect.map((state) => {
          // After replaying 2 events, nextEventNumber should be 2
          expect(state.nextEventNumber).toBe(2);
          expect(Option.isSome(state.data)).toBe(true);
          Option.match(state.data, {
            onNone: () => {
              throw new Error('Expected state to be Some');
            },
            onSome: (value) => {
              expect(value.value).toBe('test-value');
              expect(value.count).toBe(1);
            },
          });
        }),
        Effect.provide(testLayer)
      );
    }
  );

  it.scoped('should allow committing at correct eventNumber after load', () => {
    const aggregateId = 'test-agg-3' as TestAggregateId;

    const incrementAtLoadedPosition = (
      state: Readonly<{
        readonly nextEventNumber: number;
        readonly data: Option.Option<TestAggregateState>;
      }>
    ) => {
      const commandEffect = TestAggregateRoot.commands.increment()(state.data);
      return pipe(
        commandEffect,
        Effect.flatMap((events) =>
          TestAggregateRoot.commit({
            id: aggregateId,
            eventNumber: state.nextEventNumber,
            events: Chunk.fromIterable(events),
          })
        )
      );
    };

    return pipe(
      // Create initial event
      TestAggregateRoot.commands.create('test-value')(),
      Effect.flatMap((events) =>
        TestAggregateRoot.commit({
          id: aggregateId,
          eventNumber: 0,
          events: Chunk.fromIterable(events),
        })
      ),
      // Load the aggregate
      Effect.andThen(() => TestAggregateRoot.load(aggregateId)),
      // Try to commit at the nextEventNumber returned by load
      Effect.flatMap(incrementAtLoadedPosition),
      Effect.map(() => {
        // Should succeed without ConcurrencyConflictError
        expect(true).toBe(true);
      }),
      Effect.provide(testLayer)
    );
  });

  it.scoped('should reject commit with wrong eventNumber', () => {
    const aggregateId = 'test-agg-4' as TestAggregateId;

    const attemptDuplicateCommit = () => {
      const commandEffect = TestAggregateRoot.commands.create('another-value')();
      return pipe(
        commandEffect,
        Effect.flatMap((events) =>
          TestAggregateRoot.commit({
            id: aggregateId,
            eventNumber: 0,
            events: Chunk.fromIterable(events),
          })
        ),
        Effect.exit
      );
    };

    return pipe(
      // Create initial event
      TestAggregateRoot.commands.create('test-value')(),
      Effect.flatMap((events) =>
        TestAggregateRoot.commit({
          id: aggregateId,
          eventNumber: 0,
          events: Chunk.fromIterable(events),
        })
      ),
      // Try to commit another event at position 0 (should fail)
      Effect.andThen(attemptDuplicateCommit),
      Effect.map((exit) => {
        expect(Exit.isFailure(exit)).toBe(true);
      }),
      Effect.provide(testLayer)
    );
  });
});
