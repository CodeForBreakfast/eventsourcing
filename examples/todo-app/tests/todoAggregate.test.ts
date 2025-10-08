import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Option, Exit, pipe } from 'effect';
import { provideCommandInitiator } from '@codeforbreakfast/eventsourcing-aggregates';
import { TodoAggregateRoot } from '../src/domain/todoAggregate';
import { UserId } from '../src/domain/types';
import { TodoState } from '../src/domain/todoAggregate';

const TEST_USER = 'test-user' as UserId;

function makeTestState(
  overrides: { readonly [K in keyof Readonly<TodoState>]?: Readonly<TodoState>[K] } = {}
  // eslint-disable-next-line functional/prefer-immutable-types -- Test utility function with safe readonly return
): Option.Option<Readonly<TodoState>> {
  return Option.some(
    Object.freeze({
      title: 'Buy milk',
      completed: false,
      deleted: false,
      ...overrides,
    } as TodoState)
  );
}

describe('TodoAggregate', () => {
  describe('createTodo', () => {
    it.effect('should create a new TODO with the given title', () =>
      pipe(
        TodoAggregateRoot.commands.createTodo('Buy milk')(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          const firstEvent = events[0];
          if (!firstEvent) throw new Error('Expected first event');
          expect(firstEvent.type).toBe('TodoCreated');
          expect(firstEvent.data.title).toBe('Buy milk');
          expect(firstEvent.metadata.originator).toBe(TEST_USER);
        })
      )
    );
  });

  describe('changeTitle', () => {
    it.effect('should change the title of an existing TODO', () =>
      pipe(
        makeTestState(),
        TodoAggregateRoot.commands.changeTitle('Buy bread'),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          const firstEvent = events[0];
          if (!firstEvent) throw new Error('Expected first event');
          expect(firstEvent.type).toBe('TodoTitleChanged');
          expect(firstEvent.data.title).toBe('Buy bread');
        })
      )
    );

    it.effect('should fail when TODO does not exist', () => {
      const state = Option.none<TodoState>();
      return pipe(
        state,
        TodoAggregateRoot.commands.changeTitle('Buy bread'),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.exit,
        Effect.map((exit) => {
          expect(Exit.isFailure(exit)).toBe(true);
        })
      );
    });

    it.effect('should fail when TODO is deleted', () => {
      const state = makeTestState({ deleted: true });
      return pipe(
        state,
        TodoAggregateRoot.commands.changeTitle('Buy bread'),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.exit,
        Effect.map((exit) => {
          expect(Exit.isFailure(exit)).toBe(true);
        })
      );
    });
  });

  describe('complete', () => {
    it.effect('should complete an uncompleted TODO', () => {
      const state = makeTestState({ completed: false });
      return pipe(
        state,
        TodoAggregateRoot.commands.complete(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          const firstEvent = events[0];
          if (!firstEvent) throw new Error('Expected first event');
          expect(firstEvent.type).toBe('TodoCompleted');
        })
      );
    });

    it.effect('should return empty events when TODO is already completed', () => {
      const state = makeTestState({ completed: true });
      return pipe(
        state,
        TodoAggregateRoot.commands.complete(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });
  });

  describe('uncomplete', () => {
    it.effect('should uncomplete a completed TODO', () => {
      const state = makeTestState({ completed: true });
      return pipe(
        state,
        TodoAggregateRoot.commands.uncomplete(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          const firstEvent = events[0];
          if (!firstEvent) throw new Error('Expected first event');
          expect(firstEvent.type).toBe('TodoUncompleted');
        })
      );
    });

    it.effect('should return empty events when TODO is already uncompleted', () => {
      const state = makeTestState({ completed: false });
      return pipe(
        state,
        TodoAggregateRoot.commands.uncomplete(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });
  });

  describe('deleteTodo', () => {
    it.effect('should delete an existing TODO', () => {
      const state = makeTestState({ deleted: false });
      return pipe(
        state,
        TodoAggregateRoot.commands.deleteTodo(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(1);
          const firstEvent = events[0];
          if (!firstEvent) throw new Error('Expected first event');
          expect(firstEvent.type).toBe('TodoDeleted');
        })
      );
    });

    it.effect('should return empty events when TODO is already deleted', () => {
      const state = makeTestState({ deleted: true });
      return pipe(
        state,
        TodoAggregateRoot.commands.deleteTodo(),
        Effect.provide(provideCommandInitiator(TEST_USER)),
        Effect.orDie,
        Effect.map((events) => {
          expect(events).toHaveLength(0);
        })
      );
    });
  });
});
