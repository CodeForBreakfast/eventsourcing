import { Effect, HashMap, Queue, Scope, SynchronizedRef, pipe } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect';
import { type EventStreamId, toStreamId } from '@codeforbreakfast/eventsourcing-store';
import { type Feeds, numberedStreamFeedsOver } from './numberedStreamFeeds';

const anEvent = { eventNumber: 0, payload: 'first' };

interface Fixture {
  readonly ref: SynchronizedRef.SynchronizedRef<Feeds>;
  readonly streamId: EventStreamId;
  readonly firstScope: Scope.CloseableScope;
  readonly secondScope: Scope.CloseableScope;
}

const expectOpenFeeds = (ref: SynchronizedRef.SynchronizedRef<Feeds>, expected: number) =>
  Effect.map(SynchronizedRef.get(ref), (feeds) => expect(HashMap.size(feeds)).toBe(expected));

const subscribeIn = (fixture: Fixture, scope: Scope.CloseableScope) =>
  Scope.extend(numberedStreamFeedsOver(fixture.ref).subscribe(fixture.streamId), scope);

const publishAnEvent = (fixture: Fixture) =>
  numberedStreamFeedsOver(fixture.ref).publish(fixture.streamId, anEvent);

const subscribeTwiceThenCloseEachInTurn = (fixture: Fixture) =>
  pipe(
    subscribeIn(fixture, fixture.firstScope),
    Effect.andThen(subscribeIn(fixture, fixture.secondScope)),
    Effect.tap(() => Scope.close(fixture.firstScope, Effect.void)),
    Effect.tap(() => expectOpenFeeds(fixture.ref, 1)),
    Effect.tap(() => publishAnEvent(fixture)),
    Effect.flatMap(Queue.take),
    Effect.map((event) => expect(event).toEqual(anEvent)),
    Effect.andThen(Scope.close(fixture.secondScope, Effect.void)),
    Effect.andThen(expectOpenFeeds(fixture.ref, 0))
  );

describe('numberedStreamFeeds', () => {
  it.effect('removes a stream feed once its last subscription closes', () =>
    pipe(
      {
        ref: SynchronizedRef.make<Feeds>(HashMap.empty()),
        streamId: toStreamId('numbered-feed-stream'),
        firstScope: Scope.make(),
        secondScope: Scope.make(),
      },
      Effect.all,
      Effect.flatMap(subscribeTwiceThenCloseEachInTurn)
    )
  );
});
