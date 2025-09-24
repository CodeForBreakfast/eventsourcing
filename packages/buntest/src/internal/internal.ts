/**
 * Adapted from @effect/vitest
 * Original work: Copyright (c) 2025 Effectful Technologies Inc.
 * Modified work: Copyright (c) 2025 CodeForBreakfast
 *
 * @since 1.0.0
 */
import * as Cause from 'effect/Cause';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Equal from 'effect/Equal';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import { flow, identity, pipe } from 'effect/Function';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as Schedule from 'effect/Schedule';
import * as Scope from 'effect/Scope';
import * as TestEnvironment from 'effect/TestContext';
import type * as TestServices from 'effect/TestServices';
import * as Utils from 'effect/Utils';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type * as Buntest from '../types.js';

// Bun test context type
interface BunTestContext {
  signal?: AbortSignal;
  onTestFinished?(callback: () => void | Promise<void>): void;
}

const runPromise =
  (ctx?: BunTestContext) =>
  <E, A>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      const exitFiber = yield* Effect.fork(Effect.exit(effect));

      ctx?.onTestFinished?.(() =>
        Fiber.interrupt(exitFiber).pipe(Effect.asVoid, Effect.runPromise)
      );

      const exit = yield* Fiber.join(exitFiber);
      if (Exit.isSuccess(exit)) {
        return () => exit.value;
      } else {
        if (Cause.isInterruptedOnly(exit.cause)) {
          return () => {
            throw new Error('All fibers interrupted without errors.');
          };
        }
        const errors = Cause.prettyErrors(exit.cause);
        for (let i = 1; i < errors.length; i++) {
          yield* Effect.logError(errors[i]);
        }
        return () => {
          throw errors[0];
        };
      }
    })
      .pipe((effect) => Effect.runPromise(effect, { signal: ctx?.signal }))
      .then((f) => f());

/** @internal */
const runTest =
  (ctx?: BunTestContext) =>
  <E, A>(effect: Effect.Effect<A, E>) =>
    runPromise(ctx)(effect);

const silentLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make(() => {})
);

/** @internal */
const TestEnv = TestEnvironment.TestContext.pipe(Layer.provide(silentLogger));

// Bun test doesn't have expect.addEqualityTesters, so we'll add custom matchers
/** @internal */
export const addEqualityTesters = () => {
  // Add Effect equality testers using extend
  expect.extend({
    toEqualEffect(received: any, expected: any) {
      if (!Equal.isEqual(received) || !Equal.isEqual(expected)) {
        return {
          pass: false,
          message: () => 'Values are not Effect Equal types',
        };
      }
      const pass = Utils.structuralRegion(
        () => Equal.equals(received, expected),
        (x, y) => this.equals(x, y)
      );
      return {
        pass,
        message: () =>
          pass
            ? `Expected ${this.utils.printReceived(received)} not to equal ${this.utils.printExpected(expected)}`
            : `Expected ${this.utils.printReceived(received)} to equal ${this.utils.printExpected(expected)}`,
      };
    },
  });
};

/** @internal */
const testOptions = (timeout?: number | { timeout?: number }) => {
  if (typeof timeout === 'number') {
    return { timeout };
  }
  return timeout ?? {};
};

/** @internal */
const makeTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>
): Buntest.Buntest.Tester<R> => {
  const run = <A, E, TestArgs extends Array<unknown>>(
    ctx: BunTestContext,
    args: TestArgs,
    self: Buntest.Buntest.TestFunction<A, E, R, TestArgs>
  ) =>
    pipe(
      Effect.suspend(() => self(...args)),
      mapEffect,
      runTest(ctx)
    );

  const f: Buntest.Buntest.Test<R> = (name, self, timeout) => {
    const options = testOptions(timeout);
    return test(name, async () => run({}, [{} as any], self), options);
  };

  const skip: Buntest.Buntest.Tester<R>['skip'] = (name, self, timeout) => {
    const options = testOptions(timeout);
    return test.skip(name, async () => run({}, [{} as any], self), options);
  };

  const skipIf: Buntest.Buntest.Tester<R>['skipIf'] = (condition) => (name, self, timeout) => {
    if (condition) {
      return skip(name, self, timeout);
    } else {
      return f(name, self, timeout);
    }
  };

  const runIf: Buntest.Buntest.Tester<R>['runIf'] = (condition) => (name, self, timeout) => {
    if (condition) {
      return f(name, self, timeout);
    } else {
      return skip(name, self, timeout);
    }
  };

  const only: Buntest.Buntest.Tester<R>['only'] = (name, self, timeout) => {
    const options = testOptions(timeout);
    return test.only(name, async () => run({}, [{} as any], self), options);
  };

  const each: Buntest.Buntest.Tester<R>['each'] = (cases) => (name, self, timeout) => {
    const options = testOptions(timeout);
    return cases.forEach((testCase, index) => {
      test(`${name} [${index}]`, async () => run({}, [testCase], self), options);
    });
  };

  const fails: Buntest.Buntest.Tester<R>['fails'] = (name, self, timeout) => {
    const options = testOptions(timeout);
    return test(
      name,
      async () => {
        await expect(run({}, [{} as any], self)).rejects.toThrow();
      },
      options
    );
  };

  return Object.assign(f, { skip, skipIf, runIf, only, each, fails });
};

/** @internal */

/** @internal */
export const layer =
  <R, E, const ExcludeTestServices extends boolean = false>(
    layer_: Layer.Layer<R, E>,
    options?: {
      readonly memoMap?: Layer.MemoMap;
      readonly timeout?: Duration.DurationInput;
      readonly excludeTestServices?: ExcludeTestServices;
    }
  ): {
    (f: (it: Buntest.Buntest.MethodsNonLive<R, ExcludeTestServices>) => void): void;
    (name: string, f: (it: Buntest.Buntest.MethodsNonLive<R, ExcludeTestServices>) => void): void;
  } =>
  (
    ...args:
      | [name: string, f: (it: Buntest.Buntest.MethodsNonLive<R, ExcludeTestServices>) => void]
      | [f: (it: Buntest.Buntest.MethodsNonLive<R, ExcludeTestServices>) => void]
  ) => {
    const excludeTestServices = options?.excludeTestServices ?? false;
    const withTestEnv = excludeTestServices
      ? (layer_ as Layer.Layer<R | TestServices.TestServices, E>)
      : Layer.provideMerge(layer_, TestEnv);
    const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap);
    const scope = Effect.runSync(Scope.make());
    const runtimeEffect = Layer.toRuntimeWithMemoMap(withTestEnv, memoMap).pipe(
      Scope.extend(scope),
      Effect.orDie,
      Effect.cached,
      Effect.runSync
    );

    const makeIt = (): Buntest.Buntest.MethodsNonLive<R, ExcludeTestServices> => ({
      effect: makeTester<TestServices.TestServices | R>((effect) =>
        Effect.flatMap(runtimeEffect, (runtime) => effect.pipe(Effect.provide(runtime)))
      ),

      scoped: makeTester<TestServices.TestServices | Scope.Scope | R>((effect) =>
        Effect.flatMap(runtimeEffect, (runtime) =>
          effect.pipe(Effect.scoped, Effect.provide(runtime))
        )
      ),
      flakyTest,
      layer<R2, E2>(
        nestedLayer: Layer.Layer<R2, E2, R>,
        options?: {
          readonly timeout?: Duration.DurationInput;
        }
      ) {
        return layer(Layer.provideMerge(nestedLayer, withTestEnv), {
          ...options,
          memoMap,
          excludeTestServices,
        });
      },
    });

    if (args.length === 1) {
      beforeAll(() => runPromise()(Effect.asVoid(runtimeEffect)));
      afterAll(() => runPromise()(Scope.close(scope, Exit.void)));
      return args[0](makeIt());
    }

    return describe(args[0], () => {
      beforeAll(() => runPromise()(Effect.asVoid(runtimeEffect)));
      afterAll(() => runPromise()(Scope.close(scope, Exit.void)));
      return args[1](makeIt());
    });
  };

/** @internal */
export const flakyTest = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  timeout: Duration.DurationInput = Duration.seconds(30)
) =>
  pipe(
    Effect.catchAllDefect(self, Effect.fail),
    Effect.retry(
      pipe(
        Schedule.recurs(10),
        Schedule.compose(Schedule.elapsed),
        Schedule.whileOutput(Duration.lessThanOrEqualTo(timeout))
      )
    ),
    Effect.orDie
  );

/** @internal */
export const makeMethods = (): Buntest.Buntest.Methods => ({
  effect: makeTester<TestServices.TestServices>(Effect.provide(TestEnv)),
  scoped: makeTester<TestServices.TestServices | Scope.Scope>(
    flow(Effect.scoped, Effect.provide(TestEnv))
  ),
  live: makeTester<never>(identity),
  scopedLive: makeTester<Scope.Scope>(Effect.scoped),
  flakyTest,
  layer,
});

/** @internal */
export const {
  /** @internal */
  effect,
  /** @internal */
  live,
  /** @internal */
  scoped,
  /** @internal */
  scopedLive,
} = makeMethods();

/** @internal */
export const describeWrapped = (name: string, f: (it: Buntest.Buntest.Methods) => void) =>
  describe(name, () => f(makeMethods()));
