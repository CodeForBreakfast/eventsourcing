/* eslint-disable effect/no-intermediate-effect-variables, effect/no-nested-pipe, effect/no-nested-pipes, effect/no-pipe-first-arg-call, effect/no-eta-expansion, effect/no-curried-calls -- Test code legitimately needs these patterns for readability */

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

    const testProgram = pipe(
      Effect.all([TestEventStore, TodoEventBus]),
      Effect.flatMap(([store, eventBus]) =>
        pipe(
          eventBus.subscribe(isTodoCreated),
          Effect.flatMap((subscription) =>
            pipe(
              makePosition,
              Effect.flatMap((position) =>
                pipe(
                  Stream.make<TodoEvent>(
                    { _tag: 'TodoCreated', id: 'todo-123', title: 'Test Todo' },
                    { _tag: 'TodoCompleted', id: 'todo-123' }
                  ),
                  Stream.run(store.append(position)),
                  Effect.andThen(
                    pipe(
                      subscription,
                      Stream.take(1),
                      Stream.timeout('1 second'),
                      Stream.runCollect
                    )
                  )
                )
              )
            )
          )
        )
      ),
      Effect.map((events) => {
        expect(events.length).toBe(1);
        const first = events[0];
        expect(isTodoCreated(first.event)).toBe(true);
        if (isTodoCreated(first.event)) {
          expect(first.event.title).toBe('Test Todo');
        }
      })
    );

    return pipe(
      testProgram,
      Effect.provide(Layer.merge(testStoreLayer, eventBusLayer)),
      Effect.scoped
    );
  });
});
