import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Either from 'effect/Either';
import * as Equal from 'effect/Equal';

export const expectSome = <A>(option: Option.Option<A>): Effect.Effect<A, string, never> =>
  Option.match(option, {
    onNone: () => Effect.fail('Expected Some but got None'),
    onSome: (value) => Effect.succeed(value),
  });

export const expectNone = <A>(option: Option.Option<A>): Effect.Effect<void, string, never> =>
  Option.match(option, {
    onNone: () => Effect.void,
    onSome: (value) => Effect.fail(`Expected None but got Some(${JSON.stringify(value)})`),
  });

export const expectRight = <R, L>(either: Either.Either<R, L>): Effect.Effect<R, string, never> =>
  Either.match(either, {
    onLeft: (left) => Effect.fail(`Expected Right but got Left(${JSON.stringify(left)})`),
    onRight: (value) => Effect.succeed(value),
  });

export const expectLeft = <R, L>(either: Either.Either<R, L>): Effect.Effect<L, string, never> =>
  Either.match(either, {
    onLeft: (value) => Effect.succeed(value),
    onRight: (right) => Effect.fail(`Expected Left but got Right(${JSON.stringify(right)})`),
  });

export const assertEqual =
  <A>(expected: A) =>
  (actual: A): Effect.Effect<void, string, never> =>
    Equal.equals(actual, expected)
      ? Effect.void
      : Effect.fail(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);

export const expectTrue =
  (message: string) =>
  (condition: boolean): Effect.Effect<void, string, never> =>
    condition ? Effect.void : Effect.fail(message);

export const expectFalse =
  (message: string) =>
  (condition: boolean): Effect.Effect<void, string, never> =>
    condition ? Effect.fail(message) : Effect.void;
