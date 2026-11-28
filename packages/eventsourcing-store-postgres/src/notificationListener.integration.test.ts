import { Chunk, Deferred, Effect, Fiber, Layer, Schema, Stream, pipe } from 'effect';
import { PgClient } from '@effect/sql-pg';
import { BunContext } from '@effect/platform-bun';
import { describe, it, expect } from 'bun:test';
import { EventStreamId, type EventStoreError } from '@codeforbreakfast/eventsourcing-store';
import {
  ALL_EVENTS_CHANNEL,
  NotificationListener,
  NotificationListenerLive,
  PostgresLive,
  makeChannelName,
  makePgConfigurationLive,
} from './index';

const TestLayer = pipe(
  NotificationListenerLive,
  Layer.provideMerge(PostgresLive),
  Layer.provide(makePgConfigurationLive('TEST_PG')),
  Layer.provide(BunContext.layer)
);

const newStreamId = () =>
  pipe(`listener-${crypto.randomUUID().substring(0, 8)}`, Schema.decode(EventStreamId));

const notifyEvent = (channelName: string, streamId: EventStreamId, eventPayload: string) =>
  Effect.flatMap(
    PgClient.PgClient,
    (client) =>
      client`SELECT pg_notify(${channelName}, ${JSON.stringify({
        stream_id: streamId,
        event_number: 0,
        event_payload: eventPayload,
      })})`
  );

type Listen = Effect.Effect<void, EventStoreError, NotificationListener>;

const listenThenSignal = (listen: Listen, listening: Deferred.Deferred<void>) =>
  pipe(
    listen,
    Effect.andThen(Deferred.succeed(listening, undefined)),
    Effect.andThen(Effect.never)
  );

const forkAndAwaitListening =
  (listen: Listen) =>
  (
    listening: Deferred.Deferred<void>
  ): Effect.Effect<Fiber.RuntimeFiber<never, EventStoreError>, never, NotificationListener> =>
    pipe(
      listenThenSignal(listen, listening),
      Effect.fork,
      Effect.tap(() => Deferred.await(listening))
    );

const holdUntilInterrupted = (listen: Listen) =>
  Effect.flatMap(Deferred.make<void>(), forkAndAwaitListening(listen));

const holdListenUntilInterrupted = (streamId: EventStreamId) =>
  holdUntilInterrupted(NotificationListener.listen(streamId));

const holdListenAllUntilInterrupted = () =>
  holdUntilInterrupted(Effect.flatMap(NotificationListener, (listener) => listener.listenAll));

const collectFor =
  (window: Parameters<typeof Effect.sleep>[0]) => (listener: typeof NotificationListener.Service) =>
    pipe(listener.notifications, Stream.interruptAfter(window), Stream.runCollect);

const payloadsAfterNotify = (channelName: string, streamId: EventStreamId, eventPayload: string) =>
  pipe(
    notifyEvent(channelName, streamId, eventPayload),
    Effect.andThen(Effect.flatMap(NotificationListener, collectFor('300 millis'))),
    Effect.map(Chunk.toReadonlyArray),
    Effect.map((notifications) => notifications.map((n) => n.payload.event_payload))
  );

const notifyAfterTheOnlyCallerEnds = (streamId: EventStreamId) =>
  pipe(
    streamId,
    holdListenUntilInterrupted,
    Effect.flatMap(Fiber.interrupt),
    Effect.andThen(payloadsAfterNotify(makeChannelName(streamId), streamId, 'after-caller-ended'))
  );

const notifyAfterOneOfTwoCallersEnds = (streamId: EventStreamId) =>
  pipe(
    streamId,
    holdListenUntilInterrupted,
    Effect.zip(holdListenUntilInterrupted(streamId)),
    Effect.flatMap(([first]) => Fiber.interrupt(first)),
    Effect.andThen(
      payloadsAfterNotify(makeChannelName(streamId), streamId, 'after-one-caller-ended')
    )
  );

const notifyAllEventsAfterAnEarlierCallerEnded = (streamId: EventStreamId) =>
  pipe(
    holdListenAllUntilInterrupted(),
    Effect.flatMap(Fiber.interrupt),
    Effect.andThen(holdListenAllUntilInterrupted()),
    Effect.andThen(payloadsAfterNotify(ALL_EVENTS_CHANNEL, streamId, 'after-earlier-caller-ended'))
  );

describe('NotificationListener', () => {
  it('should stop receiving on a channel once the fiber that listened has ended', () =>
    pipe(
      newStreamId(),
      Effect.flatMap(notifyAfterTheOnlyCallerEnds),
      Effect.map((payloads) => {
        expect(payloads).toEqual([]);
      }),
      Effect.provide(TestLayer),
      Effect.runPromise
    ));

  it('should deliver each notification once to the callers still listening on a channel', () =>
    pipe(
      newStreamId(),
      Effect.flatMap(notifyAfterOneOfTwoCallersEnds),
      Effect.map((payloads) => {
        expect(payloads).toEqual(['after-one-caller-ended']);
      }),
      Effect.provide(TestLayer),
      Effect.runPromise
    ));

  it('should deliver all-events notifications to a caller of listenAll after an earlier caller ended', () =>
    pipe(
      newStreamId(),
      Effect.flatMap(notifyAllEventsAfterAnEarlierCallerEnded),
      Effect.map((payloads) => {
        expect(payloads).toEqual(['after-earlier-caller-ended']);
      }),
      Effect.provide(TestLayer),
      Effect.runPromise
    ));
});
