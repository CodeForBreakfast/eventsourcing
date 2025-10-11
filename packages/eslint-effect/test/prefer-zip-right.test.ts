import { pipe, Effect, Option } from 'effect';

// eslint-disable-next-line effect/prefer-zip-right
const effectBasicPartial = Effect.flatMap(() => Effect.succeed(2));

const effectWithPipe = pipe(
  Effect.succeed(1),
  // eslint-disable-next-line effect/prefer-zip-right
  Effect.flatMap(() => Effect.succeed(2))
);

// eslint-disable-next-line effect/prefer-zip-right
const effectMultilinePartial = Effect.flatMap(() => Effect.succeed('other'));

const effectNestedPipes = pipe(
  Effect.succeed('data'),
  // eslint-disable-next-line effect/prefer-zip-right
  Effect.flatMap(() =>
    pipe(
      Effect.succeed('log'),
      Effect.map((x) => x.toUpperCase())
    )
  )
);

// eslint-disable-next-line effect/prefer-zip-right
const optionBasicPartial = Option.flatMap(() => Option.some(2));

const optionWithPipe = pipe(
  Option.some(1),
  // eslint-disable-next-line effect/prefer-zip-right
  Option.flatMap(() => Option.some(2))
);

// eslint-disable-next-line effect/prefer-zip-right
const optionMultilinePartial = Option.flatMap(() => Option.some('validation'));

const correctUsageZipRight = pipe(Effect.succeed(1), Effect.zipRight(Effect.succeed(2)));

const correctOptionZipRight = pipe(Option.some(1), Option.zipRight(Option.some(2)));

const flatMapWithParam = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.succeed(a))
);

const flatMapWithParamUsed = pipe(
  Effect.succeed(1),
  Effect.flatMap((x) => Effect.succeed(x + 1))
);

const flatMapWithBothParams = pipe(
  Effect.succeed(1),
  Effect.flatMap((a) => Effect.map(Effect.succeed(2), (b) => a + b))
);

const flatMapWithBlock = Effect.flatMap(() => {
  return Effect.succeed(2);
});

const flatMapWithBlockExpression = Effect.flatMap(() => {
  const value = 2;
  return Effect.succeed(value);
});
