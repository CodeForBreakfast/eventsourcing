import { pipe, Effect, Option, Stream } from 'effect';

// eslint-disable-next-line effect/prefer-as-void -- Testing map with void 0
const mapVoidZero = Effect.map(() => void 0);

// eslint-disable-next-line effect/prefer-as-void -- Testing map with undefined
const mapUndefined = Effect.map(() => undefined);

// eslint-disable-next-line effect/prefer-as-void -- Testing map with empty block
const mapEmptyBlock = Effect.map(() => {});

const mapVoidInPipe = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-void -- Testing map with void in pipe
  Effect.map(() => void 0)
);

const mapUndefinedInPipe = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed('hello'),
  // eslint-disable-next-line effect/prefer-as-void -- Testing map with undefined in pipe
  Effect.map(() => undefined)
);

// eslint-disable-next-line effect/prefer-as-void -- Testing Option.map with void
const optionMapVoid = Option.map(() => void 0);

// eslint-disable-next-line effect/prefer-as-void -- Testing Stream.map with void
const streamMapVoid = Stream.map(() => undefined);

const correctUsage = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.asVoid
);

const correctOptionUsage = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Option.some(42),
  Option.asVoid
);

const mapWithParameter = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.map((x) => void 0)
);

const mapWithValue = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as -- Testing map with constant value
  Effect.map(() => 'hello')
);
