import { pipe, Effect } from 'effect';

// Direct call without pipe
// eslint-disable-next-line effect/prefer-andThen -- Testing flatMap with discarded input
const flatMapDirect = Effect.flatMap(() => Effect.succeed('hello'));

const flatMapDiscarded = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen -- Testing flatMap with discarded input
  Effect.flatMap(() => Effect.succeed('hello'))
);
