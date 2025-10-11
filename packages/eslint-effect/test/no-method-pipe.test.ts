import { Effect } from 'effect';

const methodPipe = Effect.succeed(42).pipe(Effect.map((x) => x + 1));
