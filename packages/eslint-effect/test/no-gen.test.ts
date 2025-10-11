import { Effect } from 'effect';

const genTest = Effect.gen(function* () {
  yield* Effect.succeed(42);
  return 'done';
});

// We only ban Effect.gen() calls, not the reference itself
const genRef = Effect.gen;
