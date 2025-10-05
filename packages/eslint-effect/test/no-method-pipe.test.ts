import { Effect } from 'effect';

// eslint-disable-next-line effect/no-method-pipe -- Testing method-based pipe ban
const methodPipe = Effect.succeed(42).pipe(Effect.map((x) => x + 1));
