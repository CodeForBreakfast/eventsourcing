import { pipe, Effect } from 'effect';

const firstArgFnCall = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

const identityMap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call
  Effect.succeed(42),

  Effect.map((x) => x)
);
