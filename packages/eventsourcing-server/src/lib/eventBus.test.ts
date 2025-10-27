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

const makeEncodedEventStore =
  (todoSchema: typeof TodoEvent) => (store: ReturnType<typeof makeInMemoryEventStore>) => {
    const encodedStore = encodedEventStore(todoSchema);
    return encodedStore(store);
  };

const makeTestStoreLayer = () =>
  Layer.effect(
    TestEventStore,
    pipe(
      InMemoryStore.make<TodoEvent>(),
      Effect.flatMap(makeInMemoryEventStore),
      Effect.map(makeEncodedEventStore(TodoEvent))
    )
  );

const makeEventBusLayer = () => EventBusLive({ store: TestEventStore });

const makeCombinedLayer = () => {
  const testStoreLayer = makeTestStoreLayer();
  const eventBusLayer = makeEventBusLayer();
  return pipe(eventBusLayer, Layer.provide(testStoreLayer), Layer.merge(testStoreLayer));
};

const makeStreamStart = (streamId: string): Effect.Effect<EventStreamPosition> =>
  Effect.succeed({ streamId, eventNumber: 0 } as EventStreamPosition);

const collectEvents = (subscription: Stream.Stream<{ readonly event: TodoEvent }>, count = 1) =>
  pipe(subscription, Stream.take(count), Stream.timeout('1 second'), Stream.runCollect);

type EncodedStore = ReturnType<ReturnType<typeof encodedEventStore<TodoEvent>>>;

const writeEvents = (
  store: EncodedStore,
  position: EventStreamPosition,
  events: readonly TodoEvent[]
) => pipe(events, Stream.fromIterable, Stream.run(store.append(position)));

describe('EventBus', () => {
  it.effect('distributes events from EventStore.subscribeAll() to subscribers', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const verifyEvents = (eventsChunk: ReadonlyArray<{ readonly event: TodoEvent }>) => {
      const events = Array.from(eventsChunk);
      expect(events.length).toBe(1);
      const first = events[0];
      expect(isTodoCreated(first.event)).toBe(true);
      if (isTodoCreated(first.event)) {
        expect(first.event.title).toBe('Test Todo');
      }
    };

    const writeAndCollect = (
      store: EncodedStore,
      position: EventStreamPosition,
      subscription: Stream.Stream<{ readonly event: TodoEvent }>
    ) =>
      pipe(
        writeEvents(store, position, [
          { _tag: 'TodoCreated', id: 'todo-123', title: 'Test Todo' },
          { _tag: 'TodoCompleted', id: 'todo-123' },
        ]),
        Effect.andThen(collectEvents(subscription))
      );

    const subscribeAndCollect = ([store, eventBus, position]: readonly [
      EncodedStore,
      ReturnType<typeof EventBus<TodoEvent>>,
      EventStreamPosition,
    ]) =>
      pipe(
        isTodoCreated,
        eventBus.subscribe,
        Effect.flatMap((subscription) => writeAndCollect(store, position, subscription))
      );

    return pipe(
      [TestEventStore, TodoEventBus, makeStreamStart('todo-123')] as const,
      Effect.all,
      Effect.flatMap(subscribeAndCollect),
      Effect.map(verifyEvents),
      Effect.scoped,
      Effect.provide(makeCombinedLayer())
    );
  });

  it.effect('only distributes events committed AFTER subscription (live-only)', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const verifyEvents = (eventsChunk: ReadonlyArray<{ readonly event: TodoEvent }>) => {
      const events = Array.from(eventsChunk);
      expect(events.length).toBe(1);
      const first = events[0];
      expect(isTodoCreated(first.event)).toBe(true);
      if (isTodoCreated(first.event)) {
        expect(first.event.title).toBe('After Subscription');
      }
    };

    const writeBeforeEvents = ([store, positionBefore]: readonly [
      EncodedStore,
      EventStreamPosition,
    ]) =>
      pipe(
        writeEvents(store, positionBefore, [
          { _tag: 'TodoCreated', id: 'todo-before', title: 'Before Subscription' },
        ]),
        Effect.as(store)
      );

    const writeAfterAndCollect = (
      store: EncodedStore,
      positionAfter: EventStreamPosition,
      subscription: Stream.Stream<{ readonly event: TodoEvent }>
    ) =>
      pipe(
        writeEvents(store, positionAfter, [
          { _tag: 'TodoCreated', id: 'todo-after', title: 'After Subscription' },
        ]),
        Effect.andThen(collectEvents(subscription))
      );

    const subscribeToCreated = (
      eventBus: ReturnType<typeof EventBus<TodoEvent>>,
      store: EncodedStore,
      positionAfter: EventStreamPosition
    ) =>
      pipe(
        isTodoCreated,
        eventBus.subscribe,
        Effect.flatMap((sub) => writeAfterAndCollect(store, positionAfter, sub))
      );

    const subscribeAndWriteAfter = (store: EncodedStore) =>
      pipe(
        [TodoEventBus, makeStreamStart('todo-after')] as const,
        Effect.all,
        Effect.flatMap(([eventBus, positionAfter]) =>
          subscribeToCreated(eventBus, store, positionAfter)
        )
      );

    return pipe(
      [TestEventStore, makeStreamStart('todo-before')] as const,
      Effect.all,
      Effect.flatMap(writeBeforeEvents),
      Effect.flatMap(subscribeAndWriteAfter),
      Effect.map(verifyEvents),
      Effect.scoped,
      Effect.provide(makeCombinedLayer())
    );
  });

  it.effect('distributes same events to multiple subscribers independently', () => {
    const TodoEventBus = EventBus<TodoEvent>();
    const acceptAll = (_event: TodoEvent): _event is TodoEvent => true;

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

    const subscribeSecond = (
      eventBus: ReturnType<typeof EventBus<TodoEvent>>,
      store: EncodedStore,
      sub1: Stream.Stream<{ readonly event: TodoEvent }>,
      position: EventStreamPosition
    ) =>
      pipe(
        acceptAll,
        eventBus.subscribe,
        Effect.map((sub2) => [store, sub1, sub2, position] as const)
      );

    const setupSubscriptions = ([store, eventBus, position]: readonly [
      EncodedStore,
      ReturnType<typeof EventBus<TodoEvent>>,
      EventStreamPosition,
    ]) =>
      pipe(
        acceptAll,
        eventBus.subscribe,
        Effect.flatMap((sub1) => subscribeSecond(eventBus, store, sub1, position))
      );

    const joinBothFibers =
      (sub2: Stream.Stream<{ readonly event: TodoEvent }>) =>
      (fiber1: Fiber.RuntimeFiber<ReadonlyArray<{ readonly event: TodoEvent }>, never>) =>
        pipe(
          collectEvents(sub2, 2),
          Effect.fork,
          Effect.flatMap((fiber2) => Effect.all([Fiber.join(fiber1), Fiber.join(fiber2)]))
        );

    const writeAndCollectFromBoth = ([store, sub1, sub2, position]: readonly [
      EncodedStore,
      Stream.Stream<{ readonly event: TodoEvent }>,
      Stream.Stream<{ readonly event: TodoEvent }>,
      EventStreamPosition,
    ]) =>
      pipe(
        writeEvents(store, position, [
          { _tag: 'TodoCreated', id: 'todo-multi', title: 'Multi Subscriber Test' },
          { _tag: 'TodoCompleted', id: 'todo-multi' },
        ]),
        Effect.zipRight(Effect.yieldNow()),
        Effect.andThen(Effect.fork(collectEvents(sub1, 2))),
        Effect.flatMap(joinBothFibers(sub2))
      );

    return pipe(
      [TestEventStore, TodoEventBus, makeStreamStart('todo-multi')] as const,
      Effect.all,
      Effect.flatMap(setupSubscriptions),
      Effect.flatMap(writeAndCollectFromBoth),
      Effect.map(verifyBothSubscriptions),
      Effect.scoped,
      Effect.provide(makeCombinedLayer())
    );
  });

  it.effect('cleans up subscriptions when scope closes', () => {
    const TodoEventBus = EventBus<TodoEvent>();

    const forkSubscription = (subscription: Stream.Stream<{ readonly event: TodoEvent }>) =>
      pipe(subscription, Stream.runDrain, Effect.fork, Effect.as('subscribed'));

    const subscribeAndFork = (eventBus: ReturnType<typeof EventBus<TodoEvent>>) =>
      pipe(isTodoCreated, eventBus.subscribe, Effect.flatMap(forkSubscription));

    return pipe(
      TodoEventBus,
      Effect.flatMap(subscribeAndFork),
      Effect.scoped,
      Effect.provide(makeCombinedLayer()),
      Effect.map((result) => expect(result).toBe('subscribed'))
    );
  });
});
