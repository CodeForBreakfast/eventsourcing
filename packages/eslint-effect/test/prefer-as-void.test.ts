import { pipe, Effect, Option, Stream } from 'effect';

// eslint-disable-next-line effect/prefer-as-void
const mapVoidZero = Effect.map(() => void 0);

// eslint-disable-next-line effect/prefer-as-void
const mapUndefined = Effect.map(() => undefined);

// eslint-disable-next-line effect/prefer-as-void
const mapEmptyBlock = Effect.map(() => {});

const mapVoidInPipe = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-void
  Effect.map(() => void 0)
);

const mapUndefinedInPipe = pipe(
  Effect.succeed('hello'),
  // eslint-disable-next-line effect/prefer-as-void
  Effect.map(() => undefined)
);

// eslint-disable-next-line effect/prefer-as-void
const optionMapVoid = Option.map(() => void 0);

// eslint-disable-next-line effect/prefer-as-void
const streamMapVoid = Stream.map(() => undefined);

const correctUsage = pipe(Effect.succeed(42), Effect.asVoid);

const correctOptionUsage = pipe(Option.some(42), Option.asVoid);

const mapWithParameter = pipe(
  Effect.succeed(42),
  Effect.map((x) => void 0)
);

const mapWithValue = pipe(
  Effect.succeed(42),

  Effect.map(() => 'hello')
);
