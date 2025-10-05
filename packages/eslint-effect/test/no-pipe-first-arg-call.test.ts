import { pipe, Effect } from 'effect';

const firstArgFnCall = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg function call ban
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

const identityMap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg function call ban
  Effect.succeed(42),
  // eslint-disable-next-line effect/no-identity-transform -- Testing identity function ban
  Effect.map((x) => x)
);
