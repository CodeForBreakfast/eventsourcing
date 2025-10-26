/* eslint-disable effect/no-nested-pipe -- Integration test requires deep nesting for fiber coordination across subscriptions */
/* eslint-disable effect/no-pipe-first-arg-call -- Integration test uses function calls in pipe for setup operations like decodeStreamId and subscriptions */
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

const collectStreamEvents = (stream: Stream.Stream<string, unknown, never>, count: number) =>
  pipe(stream, Stream.take(count), Stream.runCollect, Effect.fork);

const collectAllEvents = (
  stream: Stream.Stream<
    {
      readonly position: { readonly streamId: string; readonly eventNumber: number };
      readonly event: string;
    },
    unknown,
    never
  >,
  count: number
) => pipe(stream, Stream.take(count), Stream.runCollect, Effect.fork);

const appendEvents = (
  store: EventStore<string>,
  streamId: EventStreamId,
  events: readonly string[]
) => pipe(events, Stream.fromIterable, Stream.run(store.append({ streamId, eventNumber: 0 })));

describe('Bridge notification publishing', () => {
  it('should publish events to BOTH per-stream subscribers AND all-events subscribers', () =>
    pipe(
      decodeStreamId(randomId()),
      Effect.flatMap((streamId) =>
        pipe(
          StringEventStore,
          Effect.flatMap((store) =>
            pipe(
              store.subscribe({ streamId, eventNumber: 0 }),
              Effect.flatMap((perStreamSubscription) =>
                pipe(
                  store.subscribeAll(),
                  Effect.flatMap((allEventsSubscription) =>
                    pipe(
                      collectStreamEvents(perStreamSubscription, 2),
                      Effect.flatMap((perStreamFiber) =>
                        pipe(
                          collectAllEvents(allEventsSubscription, 2),
                          Effect.flatMap((allEventsFiber) =>
                            pipe(
                              Effect.sleep('100 millis'),
                              Effect.andThen(
                                appendEvents(store, streamId, ['test-event-1', 'test-event-2'])
                              ),
                              Effect.andThen(Fiber.join(perStreamFiber)),
                              Effect.flatMap((perStreamEvents) =>
                                pipe(
                                  Fiber.join(allEventsFiber),
                                  Effect.map((allEvents) => {
                                    expect(Chunk.size(perStreamEvents)).toBe(2);
                                    expect(Array.from(perStreamEvents)).toEqual([
                                      'test-event-1',
                                      'test-event-2',
                                    ]);

                                    expect(Chunk.size(allEvents)).toBe(2);
                                    expect(
                                      Array.from(Chunk.map(allEvents, (e) => e.event))
                                    ).toEqual(['test-event-1', 'test-event-2']);
                                    expect(
                                      Array.from(Chunk.map(allEvents, (e) => e.position.streamId))
                                    ).toEqual([streamId, streamId]);
                                  })
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
      Effect.provide(TestLayer),
      Effect.runPromise
    ));

  it('should publish events from different streams to all-events subscribers', () =>
    pipe(
      decodeStreamId(randomId()),
      Effect.flatMap((streamId1) =>
        pipe(
          decodeStreamId(randomId()),
          Effect.flatMap((streamId2) =>
            pipe(
              StringEventStore,
              Effect.flatMap((store) =>
                pipe(
                  store.subscribeAll(),
                  Effect.flatMap((allEventsSubscription) =>
                    pipe(
                      collectAllEvents(allEventsSubscription, 4),
                      Effect.flatMap((allEventsFiber) =>
                        pipe(
                          Effect.sleep('100 millis'),
                          Effect.andThen(
                            appendEvents(store, streamId1, ['stream1-event1', 'stream1-event2'])
                          ),
                          Effect.andThen(
                            appendEvents(store, streamId2, ['stream2-event1', 'stream2-event2'])
                          ),
                          Effect.andThen(Fiber.join(allEventsFiber)),
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
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
      Effect.provide(TestLayer),
      Effect.runPromise
    ));
});
