import { Effect, Layer, Schema, Stream, Fiber, Chunk, pipe } from 'effect';
import { BunContext } from '@effect/platform-bun';
import { describe, it, expect } from 'bun:test';
import { type EventStore, EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import {
  sqlEventStore,
  EventSubscriptionServicesLive,
  EventRowServiceLive,
  PostgresLive,
  makePgConfigurationLive,
} from './index';
import * as Logger from 'effect/Logger';

const decodeStreamId = Schema.decode(EventStreamId);
const randomId = () => `bridge-test-${Math.random().toString(36).substring(2, 15)}`;

class StringEventStore extends Effect.Tag('StringEventStore')<
  StringEventStore,
  EventStore<string>
>() {}

const TestLayer = Layer.provide(
  Layer.provide(
    Layer.provide(
      Layer.provide(
        Layer.effect(StringEventStore, sqlEventStore),
        Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, Logger.pretty)
      ),
      PostgresLive
    ),
    makePgConfigurationLive('TEST_PG')
  ),
  BunContext.layer
);

const collectEvents = <T>(stream: Stream.Stream<T, unknown, never>, count: number) =>
  pipe(stream, Stream.take(count), Stream.runCollect, Effect.fork);

const appendEvents = (
  store: EventStore<string>,
  streamId: EventStreamId,
  events: readonly string[]
) => pipe(events, Stream.fromIterable, Stream.run(store.append({ streamId, eventNumber: 0 })));

const forkPerStreamSubscription = (store: EventStore<string>, streamId: EventStreamId) => {
  const subscription = store.subscribe({ streamId, eventNumber: 0 });
  return pipe(
    subscription,
    Effect.flatMap((stream) => collectEvents(stream, 2))
  );
};

const forkAllEventsSubscription = (store: EventStore<string>, count: number) => {
  const subscription = store.subscribeAll();
  return pipe(
    subscription,
    Effect.flatMap((stream) => collectEvents(stream, count))
  );
};

const setupDualSubscriptions = (store: EventStore<string>, streamId: EventStreamId) =>
  Effect.all({
    perStreamFiber: forkPerStreamSubscription(store, streamId),
    allEventsFiber: forkAllEventsSubscription(store, 2),
  });

const sleep100Ms = Effect.sleep('100 millis');

const appendEventsAfterDelay = (
  store: EventStore<string>,
  streamId: EventStreamId,
  events: readonly string[]
) => pipe(sleep100Ms, Effect.andThen(appendEvents(store, streamId, events)));

const joinBothFibers = (
  perStreamFiber: Fiber.Fiber<Chunk.Chunk<string>, unknown>,
  allEventsFiber: Fiber.Fiber<
    Chunk.Chunk<{
      readonly position: { readonly streamId: string; readonly eventNumber: number };
      readonly event: string;
    }>,
    unknown
  >
) =>
  Effect.all({
    perStreamEvents: Fiber.join(perStreamFiber),
    allEvents: Fiber.join(allEventsFiber),
  });

const waitPublishAndJoin = (
  store: EventStore<string>,
  streamId: EventStreamId,
  events: readonly string[],
  perStreamFiber: Fiber.Fiber<Chunk.Chunk<string>, unknown>,
  allEventsFiber: Fiber.Fiber<
    Chunk.Chunk<{
      readonly position: { readonly streamId: string; readonly eventNumber: number };
      readonly event: string;
    }>,
    unknown
  >
) =>
  pipe(
    appendEventsAfterDelay(store, streamId, events),
    Effect.andThen(joinBothFibers(perStreamFiber, allEventsFiber))
  );

const publishAndCollectDualSubscriptions = (
  store: EventStore<string>,
  streamId: EventStreamId,
  events: readonly string[]
) =>
  pipe(
    setupDualSubscriptions(store, streamId),
    Effect.flatMap(({ perStreamFiber, allEventsFiber }) =>
      waitPublishAndJoin(store, streamId, events, perStreamFiber, allEventsFiber)
    )
  );

const appendToBothStreamsAfterDelay = (
  store: EventStore<string>,
  stream1: { readonly id: EventStreamId; readonly events: readonly string[] },
  stream2: { readonly id: EventStreamId; readonly events: readonly string[] }
) =>
  pipe(
    sleep100Ms,
    Effect.andThen(appendEvents(store, stream1.id, stream1.events)),
    Effect.andThen(appendEvents(store, stream2.id, stream2.events))
  );

const waitPublishAndJoinAll = (
  store: EventStore<string>,
  stream1: { readonly id: EventStreamId; readonly events: readonly string[] },
  stream2: { readonly id: EventStreamId; readonly events: readonly string[] },
  allEventsFiber: Fiber.Fiber<
    Chunk.Chunk<{
      readonly position: { readonly streamId: string; readonly eventNumber: number };
      readonly event: string;
    }>,
    unknown
  >
) =>
  pipe(
    appendToBothStreamsAfterDelay(store, stream1, stream2),
    Effect.andThen(Fiber.join(allEventsFiber))
  );

const publishToMultipleStreamsAndCollect = (
  store: EventStore<string>,
  stream1: { readonly id: EventStreamId; readonly events: readonly string[] },
  stream2: { readonly id: EventStreamId; readonly events: readonly string[] }
) =>
  pipe(
    forkAllEventsSubscription(store, stream1.events.length + stream2.events.length),
    Effect.flatMap((allEventsFiber) =>
      waitPublishAndJoinAll(store, stream1, stream2, allEventsFiber)
    )
  );

const runDualSubscriptionTest = (streamId: EventStreamId) =>
  pipe(
    StringEventStore,
    Effect.flatMap((store) =>
      publishAndCollectDualSubscriptions(store, streamId, ['test-event-1', 'test-event-2'])
    ),
    Effect.map(({ perStreamEvents, allEvents }) => {
      expect(Chunk.size(perStreamEvents)).toBe(2);
      expect(Array.from(perStreamEvents)).toEqual(['test-event-1', 'test-event-2']);

      expect(Chunk.size(allEvents)).toBe(2);
      expect(Array.from(Chunk.map(allEvents, (e) => e.event))).toEqual([
        'test-event-1',
        'test-event-2',
      ]);
      expect(Array.from(Chunk.map(allEvents, (e) => e.position.streamId))).toEqual([
        streamId,
        streamId,
      ]);
    })
  );

const runMultiStreamTest = (streamId1: EventStreamId, streamId2: EventStreamId) =>
  pipe(
    StringEventStore,
    Effect.flatMap((store) =>
      publishToMultipleStreamsAndCollect(
        store,
        { id: streamId1, events: ['stream1-event1', 'stream1-event2'] },
        { id: streamId2, events: ['stream2-event1', 'stream2-event2'] }
      )
    ),
    Effect.map((allEvents) => {
      expect(Chunk.size(allEvents)).toBe(4);
      expect(Array.from(Chunk.map(allEvents, (e) => e.event))).toEqual([
        'stream1-event1',
        'stream1-event2',
        'stream2-event1',
        'stream2-event2',
      ]);

      const stream1Events = Array.from(
        Chunk.filter(allEvents, (e) => e.position.streamId === streamId1)
      );
      const stream2Events = Array.from(
        Chunk.filter(allEvents, (e) => e.position.streamId === streamId2)
      );
      expect(stream1Events.length).toBe(2);
      expect(stream2Events.length).toBe(2);
    })
  );

describe('Bridge notification publishing', () => {
  it('should publish events to BOTH per-stream subscribers AND all-events subscribers', () => {
    const streamId = decodeStreamId(randomId());
    return pipe(
      streamId,
      Effect.flatMap(runDualSubscriptionTest),
      Effect.provide(TestLayer),
      Effect.runPromise
    );
  });

  /* eslint-disable effect/no-intermediate-effect-variables -- Test setup requires intermediate variable to avoid contradicting pipe-first-arg-call rule */
  it('should publish events from different streams to all-events subscribers', () => {
    const streamIds = Effect.all({
      streamId1: decodeStreamId(randomId()),
      streamId2: decodeStreamId(randomId()),
    });
    return pipe(
      streamIds,
      Effect.flatMap(({ streamId1, streamId2 }) => runMultiStreamTest(streamId1, streamId2)),
      Effect.provide(TestLayer),
      Effect.runPromise
    );
  });
  /* eslint-enable effect/no-intermediate-effect-variables -- Re-enable rule after test */
});
