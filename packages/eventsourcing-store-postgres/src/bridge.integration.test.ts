/* eslint-disable effect/no-intermediate-effect-variables */
/* eslint-disable effect/no-eta-expansion */
/* eslint-disable effect/no-pipe-first-arg-call */
/* eslint-disable effect/no-nested-pipe */
/* eslint-disable effect/no-curried-calls */

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
const makeStreamId = (id: string) => decodeStreamId(id);
const randomId = () => `bridge-test-${Math.random().toString(36).substring(2, 15)}`;

class StringEventStore extends Effect.Tag('StringEventStore')<
  StringEventStore,
  EventStore<string>
>() {}

const TestLayer = pipe(
  Layer.effect(StringEventStore, sqlEventStore),
  Layer.provide(Layer.mergeAll(EventSubscriptionServicesLive, EventRowServiceLive, Logger.pretty)),
  Layer.provide(PostgresLive),
  Layer.provide(makePgConfigurationLive('TEST_PG')),
  Layer.provide(BunContext.layer)
);

const runWithStore = <A, E>(effect: Effect.Effect<A, E, StringEventStore>): Promise<A> =>
  pipe(effect, Effect.provide(TestLayer), Effect.runPromise);

const collectStreamEvents = (stream: Stream.Stream<string, unknown, never>) => (count: number) =>
  pipe(stream, Stream.take(count), Stream.runCollect, Effect.fork);

const collectAllEvents =
  (
    stream: Stream.Stream<
      {
        readonly position: { readonly streamId: string; readonly eventNumber: number };
        readonly event: string;
      },
      unknown,
      never
    >
  ) =>
  (count: number) =>
    pipe(stream, Stream.take(count), Stream.runCollect, Effect.fork);

const appendEvents =
  (store: EventStore<string>) => (streamId: EventStreamId, events: readonly string[]) =>
    pipe(Stream.fromIterable(events), Stream.run(store.append({ streamId, eventNumber: 0 })));

describe('Bridge notification publishing', () => {
  it('should publish events to BOTH per-stream subscribers AND all-events subscribers', () =>
    pipe(
      Effect.all({
        store: StringEventStore,
        streamId: makeStreamId(randomId()),
      }),
      Effect.flatMap(({ store, streamId }) =>
        pipe(
          Effect.all({
            perStreamSubscription: store.subscribe({ streamId, eventNumber: 0 }),
            allEventsSubscription: store.subscribeAll(),
          }),
          Effect.flatMap(({ perStreamSubscription, allEventsSubscription }) =>
            pipe(
              Effect.all({
                perStreamFiber: collectStreamEvents(perStreamSubscription)(2),
                allEventsFiber: collectAllEvents(allEventsSubscription)(2),
              }),
              Effect.tap(() => Effect.sleep('100 millis')),
              Effect.tap(() => appendEvents(store)(streamId, ['test-event-1', 'test-event-2'])),
              Effect.flatMap(({ perStreamFiber, allEventsFiber }) =>
                pipe(
                  Effect.all({
                    perStreamChunk: Fiber.join(perStreamFiber),
                    allEventsChunk: Fiber.join(allEventsFiber),
                  }),
                  Effect.map(({ perStreamChunk, allEventsChunk }) => {
                    const perStreamEvents = Chunk.toReadonlyArray(perStreamChunk);
                    const allEvents = Chunk.toReadonlyArray(allEventsChunk);

                    expect(perStreamEvents.length).toBe(2);
                    expect(perStreamEvents).toEqual(['test-event-1', 'test-event-2']);

                    expect(allEvents.length).toBe(2);
                    expect(allEvents.map((e) => e.event)).toEqual(['test-event-1', 'test-event-2']);
                    expect(allEvents.map((e) => e.position.streamId)).toEqual([streamId, streamId]);
                  })
                )
              )
            )
          )
        )
      ),
      runWithStore
    ));

  it('should publish events from different streams to all-events subscribers', () =>
    pipe(
      Effect.all({
        store: StringEventStore,
        streamId1: makeStreamId(randomId()),
        streamId2: makeStreamId(randomId()),
      }),
      Effect.flatMap(({ store, streamId1, streamId2 }) =>
        pipe(
          store.subscribeAll(),
          Effect.flatMap((allEventsSubscription) =>
            pipe(
              collectAllEvents(allEventsSubscription)(4),
              Effect.tap(() => Effect.sleep('100 millis')),
              Effect.tap(() =>
                appendEvents(store)(streamId1, ['stream1-event1', 'stream1-event2'])
              ),
              Effect.tap(() =>
                appendEvents(store)(streamId2, ['stream2-event1', 'stream2-event2'])
              ),
              Effect.flatMap((allEventsFiber) =>
                pipe(
                  Fiber.join(allEventsFiber),
                  Effect.map((allEventsChunk) => {
                    const allEvents = Chunk.toReadonlyArray(allEventsChunk);

                    expect(allEvents.length).toBe(4);
                    expect(allEvents.map((e) => e.event)).toEqual([
                      'stream1-event1',
                      'stream1-event2',
                      'stream2-event1',
                      'stream2-event2',
                    ]);

                    const stream1Events = allEvents.filter(
                      (e) => e.position.streamId === streamId1
                    );
                    const stream2Events = allEvents.filter(
                      (e) => e.position.streamId === streamId2
                    );
                    expect(stream1Events.length).toBe(2);
                    expect(stream2Events.length).toBe(2);
                  })
                )
              )
            )
          )
        )
      ),
      runWithStore
    ));
});
