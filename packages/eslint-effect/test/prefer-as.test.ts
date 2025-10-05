import { pipe, Effect } from 'effect';

// Direct call without pipe
// eslint-disable-next-line effect/prefer-as -- Testing map with constant value
const mapDirect = Effect.map(() => 'constant');

const mapConstant = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as -- Testing map with constant value
  Effect.map(() => 'constant')
);
