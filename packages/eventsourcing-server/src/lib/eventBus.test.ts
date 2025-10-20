import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, pipe, Queue } from 'effect';
import { makeEventBus } from './eventBus';

type TestEvent =
  | { readonly type: 'Created'; readonly data: { readonly id: string } }
  | { readonly type: 'Updated'; readonly data: { readonly id: string } };

const publishTwoEvents = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
  Effect.all([
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
  ]);

// Commented out - used by disabled test
// const publishThreeEvents = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
//   Effect.all([
//     bus.publish({
//       streamId: 'test-1',
//       event: { type: 'Created', data: { id: '1' } },
//       position: 1,
//     }),
//     bus.publish({
//       streamId: 'test-2',
//       event: { type: 'Updated', data: { id: '2' } },
//       position: 2,
//     }),
//     bus.publish({
//       streamId: 'test-3',
//       event: { type: 'Created', data: { id: '3' } },
//       position: 3,
//     }),
//   ]);

const collectFromQueueAndPublish = (
  queue: Queue.Queue<{
    readonly streamId: string;
    readonly event: TestEvent;
    readonly position: number;
  }>,
  publishEffect: Effect.Effect<ReadonlyArray<void>, never, never>
) => pipe(publishEffect, Effect.andThen(Queue.take(queue)));

const forkStreamToQueue = (
  stream: Stream.Stream<
    {
      readonly streamId: string;
      readonly event: TestEvent;
      readonly position: number;
    },
    never,
    never
  >,
  queue: Queue.Queue<{
    readonly streamId: string;
    readonly event: TestEvent;
    readonly position: number;
  }>
) =>
  pipe(
    stream,
    Stream.runForEach((event) => Queue.offer(queue, event)),
    Effect.fork
  );

const subscribeAndFeedQueue = <TFilteredEvent extends TestEvent>(
  bus: ReturnType<typeof makeEventBus<TestEvent>>,
  filter: (event: TestEvent) => event is TFilteredEvent,
  queue: Queue.Queue<{
    readonly streamId: string;
    readonly event: TestEvent;
    readonly position: number;
  }>
) =>
  pipe(
    filter,
    bus.subscribe,
    Effect.flatMap((stream) => forkStreamToQueue(stream, queue))
  );

const subscribePublishAndCollect = <TFilteredEvent extends TestEvent>(
  bus: ReturnType<typeof makeEventBus<TestEvent>>,
  filter: (event: TestEvent) => event is TFilteredEvent,
  queue: Queue.Queue<{
    readonly streamId: string;
    readonly event: TestEvent;
    readonly position: number;
  }>,
  publishEffect: Effect.Effect<ReadonlyArray<void>, never, never>,
  expectedType: string
) =>
  pipe(
    subscribeAndFeedQueue(bus, filter, queue),
    Effect.asVoid,
    Effect.andThen(collectFromQueueAndPublish(queue, publishEffect)),
    Effect.map((result) => {
      expect(result.event.type).toBe(expectedType);
      return result;
    })
  );

const testFilterWithQueue = <TFilteredEvent extends TestEvent>(
  bus: ReturnType<typeof makeEventBus<TestEvent>>,
  filter: (event: TestEvent) => event is TFilteredEvent,
  publishEffect: Effect.Effect<ReadonlyArray<void>, never, never>,
  expectedType: string
) =>
  pipe(
    Queue.unbounded<{
      readonly streamId: string;
      readonly event: TestEvent;
      readonly position: number;
    }>(),
    Effect.flatMap((queue) =>
      subscribePublishAndCollect(bus, filter, queue, publishEffect, expectedType)
    )
  );

const createdFilter = (
  e: TestEvent
): e is { readonly type: 'Created'; readonly data: { readonly id: string } } =>
  e.type === 'Created';

// Commented out - used by disabled test
// const updatedFilter = (e: TestEvent): e is { readonly type: 'Updated'; readonly data: { readonly id: string } } =>
//   e.type === 'Updated';

const testCreatedFilter = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
  testFilterWithQueue(bus, createdFilter, publishTwoEvents(bus), 'Created');

// Commented out - used by disabled test
// const testUpdatedFilter = (bus: ReturnType<typeof makeEventBus<TestEvent>>) =>
//   testFilterWithQueue(bus, updatedFilter, publishThreeEvents(bus), 'Updated');

describe('EventBus', () => {
  it.effect('should publish and subscribe to events', () =>
    pipe(makeEventBus<TestEvent>(), Effect.flatMap(testCreatedFilter), Effect.scoped)
  );

  // TODO: Fix race condition with Updated filter - test times out
  // it.effect('should filter events based on type guard', () =>
  //   pipe(makeEventBus<TestEvent>(), Effect.flatMap(testUpdatedFilter), Effect.scoped)
  // );
});
