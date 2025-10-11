import { pipe, Effect } from 'effect';

// Direct call without pipe
// eslint-disable-next-line effect/prefer-andThen
const flatMapDirect = Effect.flatMap(() => Effect.succeed('hello'));

const flatMapDiscarded = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen
  Effect.flatMap(() => Effect.succeed('hello'))
);
