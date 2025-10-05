import { pipe, Effect } from 'effect';

// ========================================
// MULTIPLE PIPES IN ONE FUNCTION (should fail)
// ========================================

const multiplePipes = () => {
  const result1 = pipe(42, (x) => x + 1);
  // eslint-disable-next-line effect/no-multiple-pipes -- Testing multiple pipes ban
  const result2 = pipe(result1, (x) => x * 2);
  return result2;
};

// ========================================
// CALLING EXTRACTED FUNCTIONS WITH PIPES (should NOT fail)
// ========================================

// Helper function that contains a pipe
const extractedPipeFunction = (x: number) =>
  pipe(
    x,
    (n) => n * 2,
    (n) => n + 10
  );

// Another helper that contains a pipe
const anotherExtractedPipe = (msg: string) =>
  pipe(
    msg,
    Effect.succeed,
    Effect.map((s) => s.toUpperCase())
  );

// Should NOT fail - calling a function that contains a pipe is allowed
// because the pipe is in a separate, named function
const callExtractedFunction = (value: number) =>
  pipe(value, extractedPipeFunction, (result) => result * 3);

// Should NOT fail - using Effect.flatMap with an extracted function that has a pipe
const flatMapExtractedPipe = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed('hello'),
  Effect.flatMap(anotherExtractedPipe)
);

// Should NOT fail - using Effect.andThen with an extracted function containing a pipe
const andThenExtractedPipe = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.andThen(anotherExtractedPipe('world'))
);

// Should NOT fail - multiple calls to extracted functions, each containing pipes
const multipleExtractedCalls = (x: number, y: string) =>
  pipe(
    x,
    extractedPipeFunction,
    (n) => n + 5,
    (n) => String(n),
    (s) => s + y
  );
