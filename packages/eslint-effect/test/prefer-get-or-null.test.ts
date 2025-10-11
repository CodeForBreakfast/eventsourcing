import { pipe, Option } from 'effect';

// eslint-disable-next-line effect/prefer-get-or-null
const getOrElseNull = Option.getOrElse(() => null);

// eslint-disable-next-line effect/prefer-get-or-null
const getOrElseNullLiteral = Option.getOrElse(() => null);

const getOrElseNullInPipe = pipe(
  Option.some(42),
  // eslint-disable-next-line effect/prefer-get-or-null
  Option.getOrElse(() => null)
);

const correctUsageGetOrNull = pipe(Option.some(42), Option.getOrNull);

const correctGetOrNullDirect = Option.getOrNull;

const getOrElseWithValue = pipe(
  Option.some(42),
  Option.getOrElse(() => 0)
);

const getOrElseWithUndefined = pipe(
  Option.some(42),
  Option.getOrElse(() => undefined)
);

const getOrElseWithString = pipe(
  Option.some(42),
  Option.getOrElse(() => 'default')
);

const getOrElseWithParameter = pipe(
  Option.some(42),
  Option.getOrElse((x) => null)
);

const getOrElseWithComplexExpression = pipe(
  Option.some(42),
  Option.getOrElse(() => {
    return null;
  })
);
