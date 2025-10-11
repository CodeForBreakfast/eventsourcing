import { pipe, Effect, Option, Stream, STM } from 'effect';

// Valid: flatMap uses the parameter
const validUsesParam = pipe(
  Effect.succeed(42),
  Effect.flatMap((x) => Effect.succeed(x * 2))
);

// Valid: flatMap uses the parameter in a complex way
const validUsesParamComplex = pipe(
  Effect.succeed({ value: 10 }),
  Effect.flatMap((obj) => Effect.succeed(obj.value))
);

// Valid: flatMap has multiple parameters (shouldn't happen but rule should ignore)
const validMultipleParams = pipe(
  Effect.succeed(42),
  Effect.flatMap((x: number) => Effect.succeed(x))
);

// Invalid: flatMap discards parameter (no params)
const invalidNoParams = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap(() => Effect.succeed('hello'))
);

// Invalid: flatMap discards parameter (param not used)
const invalidParamNotUsed = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap((x) => Effect.succeed('hello'))
);

// Invalid: flatMap discards parameter with Effect construction
const invalidWithConstruction = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap(() => Effect.sync(() => Date.now()))
);

// Invalid: nested pipe in flatMap
const invalidNestedPipe = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap(() =>
    pipe(
      Effect.succeed('nested'),
      Effect.map((s) => s.toUpperCase())
    )
  )
);

// Invalid: Option.flatMap
const invalidOption = pipe(
  Option.some(42),
  // eslint-disable-next-line effect/prefer-andThen
  Option.flatMap(() => Option.some('hello'))
);

// Invalid: Stream.flatMap
const invalidStream = pipe(
  Stream.make(1, 2, 3),
  // eslint-disable-next-line effect/prefer-andThen
  Stream.flatMap(() => Stream.make('a', 'b'))
);

// Invalid: STM.flatMap
const invalidSTM = pipe(
  STM.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  STM.flatMap(() => STM.succeed('hello'))
);

// Invalid: multiline flatMap with block statement
const invalidMultiline = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap(() => {
    return Effect.succeed('hello');
  })
);

// Valid: parameter is used in the body
const validUsesParamInBlock = pipe(
  Effect.succeed(42),
  Effect.flatMap((x: number) => {
    const y = x * 2;
    return Effect.succeed(y);
  })
);
