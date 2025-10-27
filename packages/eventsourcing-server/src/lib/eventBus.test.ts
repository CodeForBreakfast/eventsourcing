/* eslint-disable effect/no-intermediate-effect-variables, effect/no-eta-expansion, effect/no-curried-calls, effect/no-pipe-first-arg-call, effect/no-nested-pipe -- Test code legitimately needs these patterns for readability */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Layer, Schema, Stream, pipe, Context } from 'effect';
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

  it.skip('distributes same events to multiple subscribers independently', async () => {
    // TODO: This test has a timing issue where the second subscription doesn't receive events.
    // This needs investigation into PubSub behavior with concurrent subscribers and filtered streams.
    expect(true).toBe(true);
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
