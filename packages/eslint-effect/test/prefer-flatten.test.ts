import { pipe, Effect, Option, Array, Cause, STM } from 'effect';
import { identity } from 'effect/Function';

// eslint-disable-next-line effect/prefer-flatten
const effectFlatMapIdentityInline = Effect.flatMap((x: Effect.Effect<number>) => x);

// eslint-disable-next-line effect/prefer-flatten
const effectFlatMapIdentityRef = Effect.flatMap(identity<Effect.Effect<number>>);

// eslint-disable-next-line effect/prefer-flatten
const optionFlatMapIdentity = Option.flatMap(identity<Option.Option<number>>);

// eslint-disable-next-line effect/prefer-flatten
const arrayFlatMapIdentity = Array.flatMap(identity<Array<number>>);

// eslint-disable-next-line effect/prefer-flatten
const causeFlatMapIdentity = Cause.flatMap(identity<Cause.Cause<number>>);

// eslint-disable-next-line effect/prefer-flatten
const stmFlatMapIdentity = STM.flatMap(identity<STM.STM<number>>);

const effectInPipe = pipe(
  Effect.succeed(Effect.succeed(42)),
  // eslint-disable-next-line effect/prefer-flatten
  Effect.flatMap((x: Effect.Effect<number>) => x)
);

const optionInPipe = pipe(
  Option.some(Option.some(42)),
  // eslint-disable-next-line effect/prefer-flatten
  Option.flatMap(identity<Option.Option<number>>)
);

const arrayInPipe = pipe(
  [
    [1, 2],
    [3, 4],
  ],
  // eslint-disable-next-line effect/prefer-flatten
  Array.flatMap((x: Array<number>) => x)
);

const correctUsageFlatten = pipe(Effect.succeed(Effect.succeed(42)), Effect.flatten);

const correctOptionFlatten = pipe(Option.some(Option.some(42)), Option.flatten);

const correctArrayFlatten = pipe(
  [
    [1, 2],
    [3, 4],
  ],
  Array.flatten
);

const flatMapWithTransform = pipe(
  Effect.succeed(42),
  Effect.flatMap((x) => Effect.succeed(x * 2))
);

const flatMapWithDifferentParam = pipe(
  Effect.succeed(42),
  Effect.flatMap((n) => Effect.succeed(n + 1))
);

const flatMapWithFunction = pipe(
  Option.some(42),
  Option.flatMap((x) => Option.some(x))
);

const nestedEffects = pipe(
  Effect.succeed(Effect.succeed(Effect.succeed(42))),
  // eslint-disable-next-line effect/prefer-flatten
  Effect.flatMap(identity<Effect.Effect<Effect.Effect<number>>>)
);

const multipleTypes = pipe(
  Option.some(Option.some(Effect.succeed(42))),
  // eslint-disable-next-line effect/prefer-flatten
  Option.flatMap((x: Option.Option<Effect.Effect<number>>) => x)
);
