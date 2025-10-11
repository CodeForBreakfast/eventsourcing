import { Effect } from 'effect';

// eslint-disable-next-line effect/no-runSync
Effect.runSync(Effect.succeed(42));

// eslint-disable-next-line effect/no-runPromise
Effect.runPromise(Effect.succeed(42));
