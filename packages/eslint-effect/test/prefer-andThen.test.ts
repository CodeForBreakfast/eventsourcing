import { pipe, Effect } from 'effect';

// Direct call without pipe

const flatMapDirect = Effect.flatMap(() => Effect.succeed('hello'));

const flatMapDiscarded = pipe(
  Effect.succeed(42),

  Effect.flatMap(() => Effect.succeed('hello'))
);
