import { pipe, Effect, Option } from 'effect';

// eslint-disable-next-line effect/prefer-as-some
const effectMapOptionSome = Effect.map(Option.some);

const effectMapInPipe = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-some
  Effect.map(Option.some)
);

const nestedPipe = pipe(
  Effect.succeed(1),
  Effect.map((x) => x * 2),
  // eslint-disable-next-line effect/prefer-as-some
  Effect.map(Option.some)
);

const correctUsageAsSome = pipe(Effect.succeed(42), Effect.asSome);

const correctAsSomeDirectCall = Effect.asSome;

const mapWithDifferentFunction = pipe(
  Effect.succeed(42),
  Effect.map((x) => x * 2)
);

const mapWithArrowFunction = pipe(
  Effect.succeed(42),
  Effect.map((x) => Option.some(x))
);

const mapWithOptionNone = pipe(Effect.succeed(42), Effect.map(Option.none));

const mapWithCustomFunction = pipe(
  Effect.succeed(42),
  Effect.map((x) => {
    return Option.some(x);
  })
);

const mapWithParameter = pipe(
  Effect.succeed(42),
  Effect.map((x) => Option.some(x + 1))
);

const chainedEffect = pipe(
  Effect.succeed(1),
  // eslint-disable-next-line effect/prefer-as-some
  Effect.map(Option.some),
  Effect.flatMap((opt) =>
    Option.match(opt, {
      onNone: () => Effect.fail('error'),
      onSome: Effect.succeed,
    })
  )
);

const complexPipe = pipe(
  Effect.succeed({ id: 1, name: 'test' }),
  Effect.map((obj) => obj.name),
  // eslint-disable-next-line effect/prefer-as-some
  Effect.map(Option.some)
);
