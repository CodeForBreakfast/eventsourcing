import { Effect } from 'effect';

// eslint-disable-next-line effect/no-runSync, buntest/no-runSync-in-tests -- Testing Effect.runSync ban
Effect.runSync(Effect.succeed(42));

// eslint-disable-next-line effect/no-runPromise, buntest/no-runPromise-in-tests -- Testing Effect.runPromise ban
Effect.runPromise(Effect.succeed(42));
