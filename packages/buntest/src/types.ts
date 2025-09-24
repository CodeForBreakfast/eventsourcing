/**
 * Adapted from @effect/vitest
 * Original work: Copyright (c) 2025 Effectful Technologies Inc.
 * Modified work: Copyright (c) 2025 CodeForBreakfast
 *
 * @since 1.0.0
 */
import type * as Duration from 'effect/Duration';
import type * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import type * as TestServices from 'effect/TestServices';

/**
 * @since 1.0.0
 */
export namespace Buntest {
  /**
   * @since 1.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>;
  }

  /**
   * @since 1.0.0
   */
  export interface Test<R> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, [{}]>,
      timeout?: number | { timeout?: number }
    ): void;
  }

  /**
   * @since 1.0.0
   */
  export interface Tester<R> extends Buntest.Test<R> {
    skip: Buntest.Test<R>;
    skipIf: (condition: unknown) => Buntest.Test<R>;
    runIf: (condition: unknown) => Buntest.Test<R>;
    only: Buntest.Test<R>;
    each: <T>(
      cases: ReadonlyArray<T>
    ) => <A, E>(
      name: string,
      self: TestFunction<A, E, R, Array<T>>,
      timeout?: number | { timeout?: number }
    ) => void;
    fails: Buntest.Test<R>;
  }

  /**
   * @since 1.0.0
   */
  export interface MethodsNonLive<R = never, ExcludeTestServices extends boolean = false> {
    readonly effect: Buntest.Tester<
      (ExcludeTestServices extends true ? never : TestServices.TestServices) | R
    >;
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2>,
      timeout?: Duration.DurationInput
    ) => Effect.Effect<A, never, R2>;
    readonly scoped: Buntest.Tester<
      (ExcludeTestServices extends true ? never : TestServices.TestServices) | Scope.Scope | R
    >;
    readonly layer: <R2, E>(
      layer: Layer.Layer<R2, E, R>,
      options?: {
        readonly timeout?: Duration.DurationInput;
      }
    ) => {
      (f: (it: Buntest.MethodsNonLive<R | R2, ExcludeTestServices>) => void): void;
      (name: string, f: (it: Buntest.MethodsNonLive<R | R2, ExcludeTestServices>) => void): void;
    };
  }

  /**
   * @since 1.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Buntest.Tester<R>;
    readonly scopedLive: Buntest.Tester<Scope.Scope | R>;
  }
}
