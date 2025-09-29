import { describe, expect, it, layer } from '../src/index.js';
import { Context, Duration, Effect, Layer, TestClock } from 'effect';

// Basic test methods
it.live('live test', () => Effect.sync(() => expect(1).toEqual(1)));

it.effect('effect test', () => Effect.sync(() => expect(1).toEqual(1)));

it.scoped('scoped test', () =>
  Effect.acquireRelease(
    Effect.sync(() => expect(1).toEqual(1)),
    () => Effect.void
  )
);

it.scopedLive('scopedLive test', () =>
  Effect.acquireRelease(
    Effect.sync(() => expect(1).toEqual(1)),
    () => Effect.void
  )
);

// Each tests (parameterized)
it.live.each([1, 2, 3])('live each %s', (n) => Effect.sync(() => expect(n).toEqual(n)));

it.effect.each([1, 2, 3])('effect each %s', (n) => Effect.sync(() => expect(n).toEqual(n)));

it.scoped.each([1, 2, 3])('scoped each %s', (n) =>
  Effect.acquireRelease(
    Effect.sync(() => expect(n).toEqual(n)),
    () => Effect.void
  )
);

it.scopedLive.each([1, 2, 3])('scopedLive each %s', (n) =>
  Effect.acquireRelease(
    Effect.sync(() => expect(n).toEqual(n)),
    () => Effect.void
  )
);

// Skip tests
it.live.skip('live skipped', () => Effect.die('skipped anyway'));

it.effect.skip('effect skipped', () => Effect.die('skipped anyway'));

// Effect with TestServices example
it.effect('can use TestServices', () =>
  Effect.gen(function* () {
    // TestServices like TestClock are automatically provided in effect tests
    yield* TestClock.adjust(Duration.millis(100));
    const currentTime = yield* TestClock.currentTimeMillis;
    expect(currentTime).toEqual(100);
  })
);

// Layer sharing examples
interface FooService {
  readonly value: 'foo';
}

class Foo extends Context.Tag('Foo')<Foo, FooService>() {
  static Live = Layer.succeed(Foo, { value: 'foo' as const });
}

interface BarService {
  readonly value: 'bar';
}

class Bar extends Context.Tag('Bar')<Bar, BarService>() {
  static Live = Layer.effect(
    Bar,
    Effect.map(Foo, () => ({ value: 'bar' as const }))
  );
}

describe('layer', () => {
  layer(Foo.Live)((it) => {
    it.effect('adds context', () =>
      Effect.gen(function* () {
        const foo = yield* Foo;
        expect(foo.value).toEqual('foo');
      })
    );

    it.layer(Bar.Live)('nested', (it) => {
      it.effect('adds context', () =>
        Effect.gen(function* () {
          const foo = yield* Foo;
          const bar = yield* Bar;
          expect(foo.value).toEqual('foo');
          expect(bar.value).toEqual('bar');
        })
      );
    });

    it.layer(Bar.Live)((it) => {
      it.effect('without name', () =>
        Effect.gen(function* () {
          const foo = yield* Foo;
          const bar = yield* Bar;
          expect(foo.value).toEqual('foo');
          expect(bar.value).toEqual('bar');
        })
      );
    });

    describe('scoped resources', () => {
      interface ScopedService {
        readonly value: 'scoped';
      }

      class Scoped extends Context.Tag('Scoped')<Scoped, ScopedService>() {
        static Live = Layer.scoped(
          Scoped,
          Effect.acquireRelease(Effect.succeed({ value: 'scoped' as const }), () =>
            Effect.logInfo('Resource released')
          )
        );
      }

      it.layer(Scoped.Live)((it) => {
        it.effect('adds scoped context', () =>
          Effect.gen(function* () {
            const foo = yield* Foo;
            const scoped = yield* Scoped;
            expect(foo.value).toEqual('foo');
            expect(scoped.value).toEqual('scoped');
          })
        );
      });
    });
  });
});
