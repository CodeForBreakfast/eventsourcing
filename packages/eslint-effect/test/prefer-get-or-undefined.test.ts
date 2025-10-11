import { pipe, Option } from 'effect';

// eslint-disable-next-line effect/prefer-get-or-undefined
const getOrElseUndefined = Option.getOrElse(() => undefined);

// eslint-disable-next-line effect/prefer-get-or-undefined
const getOrElseUndefinedIdentifier = Option.getOrElse(() => undefined);

const getOrElseUndefinedInPipe = pipe(
  Option.some(42),
  // eslint-disable-next-line effect/prefer-get-or-undefined
  Option.getOrElse(() => undefined)
);

const correctUsageGetOrUndefined = pipe(Option.some(42), Option.getOrUndefined);

const correctGetOrUndefinedDirect = Option.getOrUndefined;

const getOrElseWithValue = pipe(
  Option.some(42),
  Option.getOrElse(() => 0)
);

const getOrElseWithNull = pipe(
  Option.some(42),
  Option.getOrElse(() => null)
);

const getOrElseWithString = pipe(
  Option.some(42),
  Option.getOrElse(() => 'default')
);

const getOrElseWithComplexExpression = pipe(
  Option.some(42),
  Option.getOrElse(() => {
    return undefined;
  })
);
