/* eslint-disable effect/no-nested-pipe, effect/no-pipe-first-arg-call, effect/no-direct-tag-access -- Integration tests with filesystem store require complex nested pipes */
import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Layer, Chunk, pipe } from 'effect';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Path, FileSystem } from '@effect/platform';
import { make, makeFileSystemEventStore } from '@codeforbreakfast/eventsourcing-store-filesystem';
import {
  provideCommandInitiator,
  type EventRecord,
} from '@codeforbreakfast/eventsourcing-aggregates';
import { TodoAggregate, TodoAggregateRoot } from '../src/domain/todoAggregate';
import type { TodoEvent } from '../src/domain/todoEvents';
import { TodoId, UserId } from '../src/domain/types';

const TEST_USER = 'test-user' as UserId;

const makeFilesystemLayer = (baseDir: string) =>
  Layer.provide(
    Layer.effect(
      TodoAggregate,
      pipe(
        make<EventRecord<TodoEvent, UserId>>({ baseDir }),
        Effect.flatMap(makeFileSystemEventStore)
      )
    ),
    Layer.mergeAll(BunFileSystem.layer, BunPath.layer)
  );

const cleanupTestDirectory = (baseDir: string) =>
  pipe(
    Effect.all([FileSystem.FileSystem, Path.Path] as const),
    Effect.flatMap(([fs, path]) => {
      const fullPath = path.resolve(baseDir);
      return pipe(
        fs.exists(fullPath),
        Effect.flatMap((exists) =>
          exists
            ? pipe(
                fs.remove(fullPath, { recursive: true }),
                Effect.catchAll(() => Effect.void)
              )
            : Effect.void
        )
      );
    }),
    Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
  );

describe('TodoAggregate with Filesystem Store', () => {
  const testDir = './test-todo-data';
  const testLayer = Layer.mergeAll(
    makeFilesystemLayer(testDir),
    provideCommandInitiator(TEST_USER)
  );

  it.scoped('should create and persist a todo', () => {
    const todoId = 'test-todo-1' as TodoId;
    return pipe(
      cleanupTestDirectory(testDir),
      Effect.andThen(() =>
        pipe(
          TodoAggregateRoot.commands.createTodo('Buy whisky')(),
          Effect.flatMap((events) =>
            TodoAggregateRoot.commit({
              id: todoId,
              eventNumber: 0,
              events: Chunk.fromIterable(events),
            })
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.map((loadedState) => {
            expect(loadedState.nextEventNumber).toBe(1);
            expect(loadedState.data._tag).toBe('Some');
            if (loadedState.data._tag === 'Some') {
              expect(loadedState.data.value.title).toBe('Buy whisky');
              expect(loadedState.data.value.completed).toBe(false);
              expect(loadedState.data.value.deleted).toBe(false);
            }
          })
        )
      ),
      Effect.provide(testLayer)
    );
  });

  it.scoped('should load and complete an existing todo', () => {
    const todoId = 'test-todo-2' as TodoId;
    return pipe(
      cleanupTestDirectory(testDir),
      Effect.andThen(() =>
        pipe(
          TodoAggregateRoot.commands.createTodo('Write tests')(),
          Effect.flatMap((events) =>
            TodoAggregateRoot.commit({
              id: todoId,
              eventNumber: 0,
              events: Chunk.fromIterable(events),
            })
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.tap((state) =>
            Effect.log(`[TEST] After create - nextEventNumber: ${state.nextEventNumber}`)
          ),
          Effect.flatMap((state) =>
            pipe(
              state.data,
              TodoAggregateRoot.commands.complete(),
              Effect.tap((events) =>
                Effect.log(`[TEST] Complete returned ${events.length} events`)
              ),
              Effect.flatMap((events) =>
                TodoAggregateRoot.commit({
                  id: todoId,
                  eventNumber: state.nextEventNumber,
                  events: Chunk.fromIterable(events),
                })
              )
            )
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.tap((state) =>
            Effect.log(`[TEST] After complete - nextEventNumber: ${state.nextEventNumber}`)
          ),
          Effect.map((loadedState) => {
            expect(loadedState.nextEventNumber).toBe(2);
            expect(loadedState.data._tag).toBe('Some');
            if (loadedState.data._tag === 'Some') {
              expect(loadedState.data.value.title).toBe('Write tests');
              expect(loadedState.data.value.completed).toBe(true);
            }
          })
        )
      ),
      Effect.provide(testLayer)
    );
  });

  it.scoped('should handle multiple operations on same todo', () => {
    const todoId = 'test-todo-3' as TodoId;
    return pipe(
      cleanupTestDirectory(testDir),
      Effect.andThen(() =>
        pipe(
          TodoAggregateRoot.commands.createTodo('Fix bug')(),
          Effect.flatMap((events) =>
            TodoAggregateRoot.commit({
              id: todoId,
              eventNumber: 0,
              events: Chunk.fromIterable(events),
            })
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.flatMap((state) =>
            pipe(
              state.data,
              TodoAggregateRoot.commands.changeTitle('Fix critical bug'),
              Effect.flatMap((events) =>
                TodoAggregateRoot.commit({
                  id: todoId,
                  eventNumber: state.nextEventNumber,
                  events: Chunk.fromIterable(events),
                })
              )
            )
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.flatMap((state) =>
            pipe(
              state.data,
              TodoAggregateRoot.commands.complete(),
              Effect.flatMap((events) =>
                TodoAggregateRoot.commit({
                  id: todoId,
                  eventNumber: state.nextEventNumber,
                  events: Chunk.fromIterable(events),
                })
              )
            )
          ),
          Effect.andThen(() => TodoAggregateRoot.load(todoId)),
          Effect.map((loadedState) => {
            expect(loadedState.nextEventNumber).toBe(3);
            expect(loadedState.data._tag).toBe('Some');
            if (loadedState.data._tag === 'Some') {
              expect(loadedState.data.value.title).toBe('Fix critical bug');
              expect(loadedState.data.value.completed).toBe(true);
            }
          })
        )
      ),
      Effect.provide(testLayer)
    );
  });

  it.scoped('should reject concurrent modification with wrong event number', () => {
    const todoId = 'test-todo-4' as TodoId;
    return pipe(
      cleanupTestDirectory(testDir),
      Effect.andThen(() =>
        pipe(
          TodoAggregateRoot.commands.createTodo('Test concurrency')(),
          Effect.flatMap((events) =>
            TodoAggregateRoot.commit({
              id: todoId,
              eventNumber: 0,
              events: Chunk.fromIterable(events),
            })
          ),
          Effect.andThen(() =>
            pipe(
              TodoAggregateRoot.commands.createTodo('This should fail')(),
              Effect.flatMap((events) =>
                TodoAggregateRoot.commit({
                  id: todoId,
                  eventNumber: 0,
                  events: Chunk.fromIterable(events),
                })
              ),
              Effect.exit
            )
          ),
          Effect.map((exit) => {
            expect(exit._tag).toBe('Failure');
          })
        )
      ),
      Effect.provide(testLayer)
    );
  });
});
