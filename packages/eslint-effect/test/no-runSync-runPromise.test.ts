import { Effect } from 'effect';

Effect.runSync(Effect.succeed(42));

Effect.runPromise(Effect.succeed(42));
