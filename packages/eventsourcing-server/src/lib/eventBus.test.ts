import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, Chunk, pipe } from 'effect';
import { makeEventBus } from './eventBus';

type TestEvent =
  | { readonly type: 'Created'; readonly data: { readonly id: string } }
  | { readonly type: 'Updated'; readonly data: { readonly id: string } };

const collectFirstEvent = (
  stream: Stream.Stream<
    {
      readonly streamId: string;
      readonly event: TestEvent;
      readonly position: number;
    },
    never,
    never
  >
) => pipe(stream, Stream.take(1), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

const publishAndSubscribeToCreated = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
  pipe(
    [
      bus.publish({
        streamId: 'test-1',
        event: { type: 'Created', data: { id: '1' } },
        position: 1,
      }),
      bus.publish({
        streamId: 'test-2',
        event: { type: 'Updated', data: { id: '2' } },
        position: 2,
      }),
    ],
    Effect.all,
    Effect.andThen(
      bus.subscribe(
        (e): e is { readonly type: 'Created'; readonly data: { readonly id: string } } =>
          e.type === 'Created'
      )
    ),
    Effect.flatMap(collectFirstEvent),
    Effect.map((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].event.type).toBe('Created');
    })
  );

const publishAndSubscribeToUpdated = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
  pipe(
    [
      bus.publish({
        streamId: 'test-1',
        event: { type: 'Created', data: { id: '1' } },
        position: 1,
      }),
      bus.publish({
        streamId: 'test-2',
        event: { type: 'Updated', data: { id: '2' } },
        position: 2,
      }),
      bus.publish({
        streamId: 'test-3',
        event: { type: 'Created', data: { id: '3' } },
        position: 3,
      }),
    ],
    Effect.all,
    Effect.andThen(
      bus.subscribe(
        (e): e is { readonly type: 'Updated'; readonly data: { readonly id: string } } =>
          e.type === 'Updated'
      )
    ),
    Effect.flatMap(collectFirstEvent),
    Effect.map((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].event.type).toBe('Updated');
    })
  );

describe('EventBus', () => {
  it.effect('should publish and subscribe to events', () =>
    pipe(makeEventBus<TestEvent>(), Effect.flatMap(publishAndSubscribeToCreated), Effect.scoped)
  );

  it.effect('should filter events based on type guard', () =>
    pipe(makeEventBus<TestEvent>(), Effect.flatMap(publishAndSubscribeToUpdated), Effect.scoped)
  );
});
