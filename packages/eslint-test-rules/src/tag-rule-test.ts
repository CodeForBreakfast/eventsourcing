import { Either, Option, Effect, pipe, Match } from 'effect';

const either = Either.right(42);
const option = Option.some(42);

// ========================================
// _TAG ACCESS RULES (should fail)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing _tag comparison rule
if (either._tag === 'Right') {
  console.log('right');
}

// eslint-disable-next-line no-restricted-syntax -- Testing _tag comparison on Option
if (option._tag === 'Some') {
  console.log('some');
}

// eslint-disable-next-line no-restricted-syntax -- Testing _tag in ternary
console.log(either._tag === 'Left' ? 'left' : 'right');

// eslint-disable-next-line no-restricted-syntax -- Testing switch on _tag
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line no-restricted-syntax -- Testing _tag comparison on right side
if ('Right' === either._tag) {
  console.log('right');
}

// ========================================
// EFFECT.GEN RULES (should fail)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing Effect.gen call
const genTest = Effect.gen(function* () {
  yield* Effect.succeed(42);
  return 'done';
});

// We only ban Effect.gen() calls, not the reference itself
const genRef = Effect.gen;

// ========================================
// CLASSES RULES (should fail)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing class restriction
class MyClass {
  // eslint-disable-next-line functional/prefer-immutable-types, functional/prefer-readonly-type -- Testing class property rules
  value = 42;
}

// ========================================
// EFFECT.RUNSYNC / RUNPROMISE (should fail in production)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing Effect.runSync ban
Effect.runSync(Effect.succeed(42));

// eslint-disable-next-line no-restricted-syntax -- Testing Effect.runPromise ban
Effect.runPromise(Effect.succeed(42));

// ========================================
// METHOD-BASED PIPE (should fail)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing method-based pipe ban
const methodPipe = Effect.succeed(42).pipe(Effect.map((x) => x + 1));

// ========================================
// NESTED PIPE (should fail)
// ========================================

const nestedPipe = pipe(
  42,
  // eslint-disable-next-line no-restricted-syntax, custom-rules/no-unnecessary-pipe-wrapper -- Testing nested pipe ban (also unnecessary wrapper)
  (x) => pipe(x, (y) => y + 1)
);

// ========================================
// MULTIPLE PIPES IN ONE FUNCTION (should fail)
// ========================================

// This should NOT fail - multiple pipes are only banned in same scope
const multiplePipes = () => {
  const result1 = pipe(42, (x) => x + 1);
  const result2 = pipe(result1, (x) => x * 2);
  return result2;
};

// ========================================
// IDENTITY FUNCTION (should fail)
// ========================================

const identityMap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg function call ban
  Effect.succeed(42),
  // eslint-disable-next-line no-restricted-syntax -- Testing identity function ban
  Effect.map((x) => x)
);

// ========================================
// FIRST ARG IN PIPE IS FUNCTION CALL (should fail)
// ========================================

const firstArgFnCall = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg function call ban
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

// ========================================
// FLATMAP WITH DISCARDED INPUT (should fail - use andThen)
// ========================================

// Direct call without pipe
// eslint-disable-next-line no-restricted-syntax -- Testing flatMap with discarded input
const flatMapDirect = Effect.flatMap(() => Effect.succeed('hello'));

const flatMapDiscarded = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line no-restricted-syntax -- Testing flatMap with discarded input
  Effect.flatMap(() => Effect.succeed('hello'))
);

// ========================================
// MAP WITH CONSTANT VALUE (should fail - use as)
// ========================================

// Direct call without pipe
// eslint-disable-next-line no-restricted-syntax -- Testing map with constant value
const mapDirect = Effect.map(() => 'constant');

const mapConstant = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line no-restricted-syntax -- Testing map with constant value
  Effect.map(() => 'constant')
);

// ========================================
// UNNECESSARY PIPE WRAPPER - ARROW (should fail)
// ========================================

const someFn = (x: number) => x * 2;

const unnecessaryArrowWrapper = (value: number) =>
  // eslint-disable-next-line custom-rules/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper
  pipe(value, someFn);

const unnecessaryEffectWrapper = (value: number) =>
  // eslint-disable-next-line custom-rules/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper with Effect
  pipe(value, Effect.succeed);

// ========================================
// UNNECESSARY PIPE WRAPPER - FUNCTION (should fail)
// ========================================

function unnecessaryFunctionWrapper(value: number) {
  // eslint-disable-next-line custom-rules/no-unnecessary-pipe-wrapper -- Testing unnecessary function declaration pipe wrapper
  return pipe(value, someFn);
}

const unnecessaryFunctionExpr = function (value: number) {
  // eslint-disable-next-line custom-rules/no-unnecessary-pipe-wrapper -- Testing unnecessary function expression pipe wrapper
  return pipe(value, Effect.succeed);
};

// ========================================
// MATCH.WHEN WITH _TAG (should fail - use Match.tag)
// ========================================

type MyResult =
  | { readonly _tag: 'Success'; readonly value: number }
  | { readonly _tag: 'Failure'; readonly error: string };

const matchWithTagTest = (result: MyResult) =>
  pipe(
    result,
    Match.value,
    // eslint-disable-next-line custom-rules/prefer-match-tag -- Testing Match.when with _tag ban
    Match.when({ _tag: 'Success' }, (res) => res.value),
    // eslint-disable-next-line custom-rules/prefer-match-tag -- Testing Match.when with _tag ban
    Match.when({ _tag: 'Failure' }, (res) => 0),
    Match.exhaustive
  );
