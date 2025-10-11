import { pipe, Effect } from 'effect';

const firstArgFnCall = pipe(
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

const identityMap = pipe(
  Effect.succeed(42),

  Effect.map((x) => x)
);
