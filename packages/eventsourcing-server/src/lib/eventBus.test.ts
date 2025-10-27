/* eslint-disable effect/no-intermediate-effect-variables, effect/no-eta-expansion, effect/no-curried-calls, effect/no-pipe-first-arg-call, effect/no-nested-pipe, effect/prefer-zip-right, effect/prefer-andThen -- Test code legitimately needs these patterns for readability */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Layer, Schema, Stream, pipe, Context, Fiber } from 'effect';
import { EventBus, EventBusLive } from './eventBus';
import {
  InMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import { encodedEventStore, type EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

const TodoCreated = Schema.Struct({
  _tag: Schema.Literal('TodoCreated'),
  id: Schema.String,
  title: Schema.String,
});
type TodoCreated = typeof TodoCreated.Type;

const TodoCompleted = Schema.Struct({
  _tag: Schema.Literal('TodoCompleted'),
  id: Schema.String,
});
type TodoCompleted = typeof TodoCompleted.Type;

const TodoEvent = Schema.Union(TodoCreated, TodoCompleted);
type TodoEvent = typeof TodoEvent.Type;

const isTodoCreated = Schema.is(TodoCreated);
const isTodoCompleted = Schema.is(TodoCompleted);

class TestEventStore extends Context.Tag('TestEventStore')<
  TestEventStore,
  ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>
>() {}

describe('EventBus', () => {
  it.effect('distributes events from EventStore.subscribeAll() to subscribers', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const testStoreLayer = Layer.effect(
      TestEventStore,
      pipe(
        InMemoryStore.make<TodoEvent>(),
        Effect.flatMap(makeInMemoryEventStore),
        Effect.map((store) => encodedEventStore(TodoEvent)(store))
      )
    );
    const eventBusLayer = EventBusLive({ store: TestEventStore });

    const makePosition: Effect.Effect<EventStreamPosition> = Effect.succeed({
      streamId: 'todo-123',
      eventNumber: 0,
    } as EventStreamPosition);

    const writeEvents = (
      store: ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      position: EventStreamPosition
    ) =>
      pipe(
        Stream.make<TodoEvent>(
          { _tag: 'TodoCreated', id: 'todo-123', title: 'Test Todo' },
          { _tag: 'TodoCompleted', id: 'todo-123' }
        ),
        Stream.run(store.append(position))
      );

    const collectEvents = (subscription: Stream.Stream<{ readonly event: TodoEvent }>) =>
      pipe(subscription, Stream.take(1), Stream.timeout('1 second'), Stream.runCollect);

    const verifyEvents = (eventsChunk: ReadonlyArray<{ readonly event: TodoEvent }>) => {
      const events = Array.from(eventsChunk);
      expect(events.length).toBe(1);
      const first = events[0];
      expect(isTodoCreated(first.event)).toBe(true);
      if (isTodoCreated(first.event)) {
        expect(first.event.title).toBe('Test Todo');
      }
    };

    const subscribeAndGetPosition = ([store, eventBus, position]: readonly [
      ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      ReturnType<typeof EventBus<TodoEvent>>,
      EventStreamPosition,
    ]) =>
      Effect.all([
        Effect.succeed(store),
        eventBus.subscribe(isTodoCreated),
        Effect.succeed(position),
      ]);

    const writeAndCollect = ([store, subscription, position]: readonly [
      ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      Stream.Stream<{ readonly event: TodoEvent }>,
      EventStreamPosition,
    ]) => Effect.all([writeEvents(store, position), Effect.succeed(subscription)]);

    const collectFromSubscription = ([, subscription]: readonly [
      unknown,
      Stream.Stream<{ readonly event: TodoEvent }>,
    ]) => collectEvents(subscription);

    const eventBusWithStore = pipe(eventBusLayer, Layer.provide(testStoreLayer));
    const combinedLayer = Layer.merge(testStoreLayer, eventBusWithStore);

    return pipe(
      Effect.all([TestEventStore, TodoEventBus, makePosition]),
      Effect.flatMap(subscribeAndGetPosition),
      Effect.flatMap(writeAndCollect),
      Effect.flatMap(collectFromSubscription),
      Effect.map(verifyEvents),
      Effect.provide(combinedLayer),
      Effect.scoped
    );
  });

  it.effect('only distributes events committed AFTER subscription (live-only)', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const testStoreLayer = Layer.effect(
      TestEventStore,
      pipe(
        InMemoryStore.make<TodoEvent>(),
        Effect.flatMap(makeInMemoryEventStore),
        Effect.map((store) => encodedEventStore(TodoEvent)(store))
      )
    );
    const eventBusLayer = EventBusLive({ store: TestEventStore });

    const makePositionBefore: Effect.Effect<EventStreamPosition> = Effect.succeed({
      streamId: 'todo-before',
      eventNumber: 0,
    } as EventStreamPosition);

    const makePositionAfter: Effect.Effect<EventStreamPosition> = Effect.succeed({
      streamId: 'todo-after',
      eventNumber: 0,
    } as EventStreamPosition);

    const writeEventsBefore = (
      store: ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      position: EventStreamPosition
    ) =>
      pipe(
        Stream.make<TodoEvent>({
          _tag: 'TodoCreated',
          id: 'todo-before',
          title: 'Before Subscription',
        }),
        Stream.run(store.append(position))
      );

    const writeEventsAfter = (
      store: ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      position: EventStreamPosition
    ) =>
      pipe(
        Stream.make<TodoEvent>({
          _tag: 'TodoCreated',
          id: 'todo-after',
          title: 'After Subscription',
        }),
        Stream.run(store.append(position))
      );

    const collectEvents = (subscription: Stream.Stream<{ readonly event: TodoEvent }>) =>
      pipe(subscription, Stream.take(1), Stream.timeout('1 second'), Stream.runCollect);

    const verifyEvents = (eventsChunk: ReadonlyArray<{ readonly event: TodoEvent }>) => {
      const events = Array.from(eventsChunk);
      expect(events.length).toBe(1);
      const first = events[0];
      expect(isTodoCreated(first.event)).toBe(true);
      if (isTodoCreated(first.event)) {
        expect(first.event.title).toBe('After Subscription');
      }
    };

    const eventBusWithStore = pipe(eventBusLayer, Layer.provide(testStoreLayer));
    const combinedLayer = Layer.merge(testStoreLayer, eventBusWithStore);

    return pipe(
      Effect.all([TestEventStore, makePositionBefore]),
      Effect.flatMap(([store, position]) =>
        pipe(writeEventsBefore(store, position), Effect.as(store))
      ),
      Effect.flatMap((store) =>
        pipe(
          Effect.all([TodoEventBus, makePositionAfter]),
          Effect.flatMap(([eventBus, positionAfter]) =>
            pipe(
              eventBus.subscribe(isTodoCreated),
              Effect.flatMap((subscription) =>
                pipe(
                  writeEventsAfter(store, positionAfter),
                  Effect.andThen(collectEvents(subscription))
                )
              )
            )
          )
        )
      ),
      Effect.map(verifyEvents),
      Effect.provide(combinedLayer),
      Effect.scoped
    );
  });

  it.effect('distributes same events to multiple subscribers independently', () => {
    // BUG: EventBus has an issue with multiple concurrent subscribers.
    // Even without filtering, when two subscribers are created, the second subscriber
    // receives partial or no events. This suggests a fundamental issue with how
    // PubSub.subscribe creates Dequeues or how Stream.filterMap interacts with them.
    //
    // Investigation needed:
    // 1. Verify PubSub.subscribe creates independent Dequeues for each subscriber
    // 2. Check if Stream.filterMap on Dequeue maintains proper backpressure
    // 3. Test if multiple PubSub.subscribe calls work correctly with unbounded PubSub
    //
    // Simplified test without filtering still fails - second sub gets 1 event instead of 2
    const TodoEventBus = EventBus<TodoEvent>();
    const acceptAll = (_event: TodoEvent): _event is TodoEvent => true;

    const testStoreLayer = Layer.effect(
      TestEventStore,
      pipe(
        InMemoryStore.make<TodoEvent>(),
        Effect.flatMap(makeInMemoryEventStore),
        Effect.map((store) => encodedEventStore(TodoEvent)(store))
      )
    );
    const eventBusLayer = EventBusLive({ store: TestEventStore });

    const makePosition: Effect.Effect<EventStreamPosition> = Effect.succeed({
      streamId: 'todo-multi',
      eventNumber: 0,
    } as EventStreamPosition);

    const writeEvents = (
      store: ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      position: EventStreamPosition
    ) =>
      pipe(
        Stream.make<TodoEvent>(
          { _tag: 'TodoCreated', id: 'todo-multi', title: 'Multi Subscriber Test' },
          { _tag: 'TodoCompleted', id: 'todo-multi' }
        ),
        Stream.run(store.append(position))
      );

    const collectTwo = (subscription: Stream.Stream<{ readonly event: TodoEvent }>) =>
      pipe(subscription, Stream.take(2), Stream.timeout('1 second'), Stream.runCollect);

    const setupSubscriptions = ([store, eventBus, position]: readonly [
      ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      ReturnType<typeof EventBus<TodoEvent>>,
      EventStreamPosition,
    ]) =>
      pipe(
        eventBus.subscribe(acceptAll),
        Effect.flatMap((sub1) =>
          pipe(
            eventBus.subscribe(acceptAll),
            Effect.map((sub2) => [store, sub1, sub2, position] as const)
          )
        )
      );

    const writeAndCollectBoth = ([store, sub1, sub2, position]: readonly [
      ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>,
      Stream.Stream<{ readonly event: TodoEvent }>,
      Stream.Stream<{ readonly event: TodoEvent }>,
      EventStreamPosition,
    ]) =>
      pipe(
        writeEvents(store, position),
        Effect.zipRight(Effect.yieldNow()),
        Effect.flatMap(() => Effect.fork(collectTwo(sub1))),
        Effect.flatMap((fiber1) =>
          pipe(
            Effect.fork(collectTwo(sub2)),
            Effect.flatMap((fiber2) => Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]))
          )
        )
      );

    const verifyBothSubscriptions = ([events1, events2]: readonly [
      ReadonlyArray<{ readonly event: TodoEvent }>,
      ReadonlyArray<{ readonly event: TodoEvent }>,
    ]) => {
      const arr1 = Array.from(events1);
      const arr2 = Array.from(events2);

      expect(arr1.length).toBe(2);
      expect(arr2.length).toBe(2);

      expect(isTodoCreated(arr1[0].event)).toBe(true);
      expect(isTodoCompleted(arr1[1].event)).toBe(true);

      expect(isTodoCreated(arr2[0].event)).toBe(true);
      expect(isTodoCompleted(arr2[1].event)).toBe(true);
    };

    const eventBusWithStore = pipe(eventBusLayer, Layer.provide(testStoreLayer));
    const combinedLayer = Layer.merge(testStoreLayer, eventBusWithStore);

    return pipe(
      Effect.all([TestEventStore, TodoEventBus, makePosition]),
      Effect.flatMap(setupSubscriptions),
      Effect.flatMap(writeAndCollectBoth),
      Effect.map(verifyBothSubscriptions),
      Effect.provide(combinedLayer),
      Effect.scoped
    );
  });

  it.effect('cleans up subscriptions when scope closes', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const testStoreLayer = Layer.effect(
      TestEventStore,
      pipe(
        InMemoryStore.make<TodoEvent>(),
        Effect.flatMap(makeInMemoryEventStore),
        Effect.map((store) => encodedEventStore(TodoEvent)(store))
      )
    );
    const eventBusLayer = EventBusLive({ store: TestEventStore });

    const eventBusWithStore = pipe(eventBusLayer, Layer.provide(testStoreLayer));
    const combinedLayer = Layer.merge(testStoreLayer, eventBusWithStore);

    const scopedProgram = Effect.scoped(
      pipe(
        TodoEventBus,
        Effect.flatMap((eventBus) =>
          pipe(
            eventBus.subscribe(isTodoCreated),
            Effect.flatMap((subscription) =>
              pipe(Effect.fork(Stream.runDrain(subscription)), Effect.as('subscribed'))
            )
          )
        )
      )
    );

    return pipe(
      scopedProgram,
      Effect.provide(combinedLayer),
      Effect.map((result) => expect(result).toBe('subscribed'))
    );
  });
});
