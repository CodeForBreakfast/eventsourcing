import { pipe, Effect, Option } from 'effect';

// eslint-disable-next-line effect/prefer-succeed-none
const succeedNone = Effect.succeed(Option.none());

const succeedNoneInPipe = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-succeed-none
  Effect.flatMap(() => Effect.succeed(Option.none()))
);

const catchAllSucceedNone = pipe(
  Effect.fail('error'),
  // eslint-disable-next-line effect/prefer-succeed-none
  Effect.catchAll(() => Effect.succeed(Option.none()))
);

const correctUsageSucceedNone = Effect.succeedNone;

const correctUsageSucceedNoneInPipe = pipe(
  Effect.succeed(42),
  Effect.flatMap(() => Effect.succeedNone)
);

const correctCatchAllSucceedNone = pipe(
  Effect.fail('error'),
  Effect.catchAll(() => Effect.succeedNone)
);

const succeedSome = Effect.succeed(Option.some(42));

const succeedWithValue = Effect.succeed(42);

const succeedWithNull = Effect.succeed(null);

const succeedWithUndefined = Effect.succeed(undefined);

const succeedWithComplexExpression = Effect.succeed(Option.some(42));
