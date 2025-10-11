import { pipe, Effect, Option } from 'effect';

// eslint-disable-next-line effect/prefer-zip-left
const effectBasicPartial = Effect.flatMap((a: number) => Effect.map(Effect.succeed(2), () => a));

const effectWithPipe = pipe(
  Effect.succeed(1),
  // eslint-disable-next-line effect/prefer-zip-left
  Effect.flatMap((a) => Effect.map(Effect.succeed(2), () => a))
);

// eslint-disable-next-line effect/prefer-zip-left
const effectMultilinePartial = Effect.flatMap((result: string) =>
  Effect.map(Effect.succeed('other'), () => result)
);

const effectNestedPipes = pipe(
  Effect.succeed('data'),
  Effect.flatMap((data) =>
    pipe(
      Effect.succeed('log'),
      Effect.map(() => data)
    )
  )
);

// eslint-disable-next-line effect/prefer-zip-left
const optionBasicPartial = Option.flatMap((a: number) => Option.map(Option.some(2), () => a));

const optionWithPipe = pipe(
  Option.some(1),
  // eslint-disable-next-line effect/prefer-zip-left
  Option.flatMap((a) => Option.map(Option.some(2), () => a))
);

// eslint-disable-next-line effect/prefer-zip-left
const optionMultilinePartial = Option.flatMap((value: string) =>
  Option.map(Option.some('validation'), () => value)
);

const correctUsageZipLeft = pipe(Effect.succeed(1), Effect.zipLeft(Effect.succeed(2)));

const correctOptionZipLeft = pipe(Option.some(1), Option.zipLeft(Option.some(2)));

const flatMapWithDifferentReturn = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.map(Effect.succeed(2), () => 42))
);

const flatMapWithParamUsed = pipe(
  Effect.succeed(1),
  Effect.flatMap((x) => Effect.map(Effect.succeed(2), (y) => x))
);

const flatMapWithBothParams = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.map(Effect.succeed(2), (b) => a))
);

const flatMapReturningParam = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.succeed(a))
);

const flatMapReturningEffectDifferent = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.succeed(a + 1))
);

const flatMapWithBlock = Effect.flatMap((a: number) => {
  return Effect.map(Effect.succeed(2), () => a);
});

const flatMapWithBlockReturn = Effect.flatMap((a: number) =>
  Effect.map(Effect.succeed(2), () => {
    return a;
  })
);
