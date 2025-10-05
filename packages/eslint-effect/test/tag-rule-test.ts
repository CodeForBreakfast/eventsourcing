import { Either, Option, Effect, pipe, Match, Schema } from 'effect';

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

// eslint-disable-next-line effect/no-gen -- Testing Effect.gen call
const genTest = Effect.gen(function* () {
  yield* Effect.succeed(42);
  return 'done';
});

// We only ban Effect.gen() calls, not the reference itself
const genRef = Effect.gen;

// ========================================
// CLASSES RULES (should fail)
// ========================================

// eslint-disable-next-line effect/no-classes -- Testing class restriction
class MyClass {
  // eslint-disable-next-line functional/prefer-immutable-types, functional/prefer-readonly-type -- Testing class property rules
  value = 42;
}

// ========================================
// EFFECT.RUNSYNC / RUNPROMISE (should fail in production)
// ========================================

// eslint-disable-next-line effect/no-runSync -- Testing Effect.runSync ban
Effect.runSync(Effect.succeed(42));

// eslint-disable-next-line effect/no-runPromise -- Testing Effect.runPromise ban
Effect.runPromise(Effect.succeed(42));

// ========================================
// METHOD-BASED PIPE (should fail)
// ========================================

// eslint-disable-next-line no-restricted-syntax -- Testing method-based pipe ban
const methodPipe = Effect.succeed(42).pipe(Effect.map((x) => x + 1));

// ========================================
// CURRIED FUNCTION CALLS (should fail)
// ========================================

const MySchema = Schema.Struct({ value: Schema.Number });

// eslint-disable-next-line no-restricted-syntax -- Testing curried function call ban
const curriedCall = Schema.decodeUnknown(MySchema)({ value: 42 });

// ========================================
// NESTED PIPE (should fail)
// ========================================

const nestedPipe = pipe(
  42,
  // eslint-disable-next-line no-restricted-syntax, effect/no-unnecessary-pipe-wrapper -- Testing nested pipe ban (also unnecessary wrapper)
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
// eslint-disable-next-line effect/prefer-andThen -- Testing flatMap with discarded input
const flatMapDirect = Effect.flatMap(() => Effect.succeed('hello'));

const flatMapDiscarded = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-andThen -- Testing flatMap with discarded input
  Effect.flatMap(() => Effect.succeed('hello'))
);

// ========================================
// MAP WITH CONSTANT VALUE (should fail - use as)
// ========================================

// Direct call without pipe
// eslint-disable-next-line effect/prefer-as -- Testing map with constant value
const mapDirect = Effect.map(() => 'constant');

const mapConstant = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as -- Testing map with constant value
  Effect.map(() => 'constant')
);

// ========================================
// UNNECESSARY PIPE WRAPPER - ARROW (should fail)
// ========================================

const someFn = (x: number) => x * 2;

const unnecessaryArrowWrapper = (value: number) =>
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper
  pipe(value, someFn);

const unnecessaryEffectWrapper = (value: number) =>
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper with Effect
  pipe(value, Effect.succeed);

// ========================================
// UNNECESSARY PIPE WRAPPER - FUNCTION (should fail)
// ========================================

function unnecessaryFunctionWrapper(value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary function declaration pipe wrapper
  return pipe(value, someFn);
}

const unnecessaryFunctionExpr = function (value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary function expression pipe wrapper
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
    // eslint-disable-next-line effect/prefer-match-tag -- Testing Match.when with _tag ban
    Match.when({ _tag: 'Success' }, (res) => res.value),
    // eslint-disable-next-line effect/prefer-match-tag -- Testing Match.when with _tag ban
    Match.when({ _tag: 'Failure' }, (res) => 0),
    Match.exhaustive
  );

// ========================================
// IMPERATIVE CONDITIONALS IN EFFECT CALLBACKS (should fail - use Match)
// ========================================

type MessageType =
  | { readonly _tag: 'Command'; readonly id: string }
  | { readonly _tag: 'Subscribe'; readonly streamId: string }
  | { readonly _tag: 'Unsubscribe'; readonly streamId: string };

const handleCommand = (msg: { readonly _tag: 'Command'; readonly id: string }) =>
  Effect.succeed(msg.id);
const handleSubscribe = (msg: { readonly _tag: 'Subscribe'; readonly streamId: string }) =>
  Effect.succeed(msg.streamId);
const handleMessage = (msg: MessageType) => Effect.succeed(msg);

// Should fail - if statement in Effect.flatMap checking _tag discriminator
const imperativeFlatMap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals, no-restricted-syntax -- Testing imperative if in flatMap
    if (msg._tag === 'Command') {
      return handleMessage(msg);
    }
    // eslint-disable-next-line effect/prefer-match-over-conditionals, no-restricted-syntax -- Testing imperative if in flatMap
    if (msg._tag === 'Subscribe') {
      return handleMessage(msg);
    }
    return Effect.void;
  })
);

// Should fail - if statement in Effect.map checking _tag discriminator
const imperativeMap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed(either),
  Effect.map((e) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals, no-restricted-syntax -- Testing imperative if in map with _tag
    if (e._tag === 'Right') {
      return e.right;
    }
    return 0;
  })
);

// Should fail - reverse condition order (literal first)
const imperativeReverse = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals, no-restricted-syntax -- Testing imperative if with reverse condition
    if ('Command' === msg._tag) {
      return handleMessage(msg);
    }
    return Effect.void;
  })
);

// Should NOT fail - using Match.value pattern correctly
const functionalMatch = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) =>
    // eslint-disable-next-line no-restricted-syntax -- Nested pipe is allowed for Match pattern
    pipe(
      msg,
      Match.value,
      Match.tag('Command', handleCommand),
      Match.tag('Subscribe', handleSubscribe),
      Match.orElse(() => Effect.void)
    )
  )
);

// Should NOT fail - if statement checking non-discriminator property
const nonDiscriminatorCheck = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed({ name: 'test', value: 42 }),
  Effect.flatMap((obj) => {
    if (obj.value > 10) {
      return Effect.succeed(obj.name);
    }
    return Effect.succeed('default');
  })
);

// ========================================
// TYPE ASSERTIONS IN EFFECT CALLBACKS (should fail - use Schema.decodeUnknown)
// ========================================

type ProtocolMessage = { readonly type: 'command'; readonly id: string };

// Should fail - type assertion in Effect.flatMap
const typeAssertionInFlatMap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in flatMap
    const typed = msg as ProtocolMessage;
    return Effect.succeed(typed.id);
  })
);

// Should fail - type assertion in Effect.map
const typeAssertionInMap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in map
  Effect.map((msg) => (msg as ProtocolMessage).id)
);

// Should fail - type assertion in Effect.tap
const typeAssertionInTap = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.tap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in tap
    const typed = msg as ProtocolMessage;
    return Effect.log(typed.id);
  })
);

// Should fail - double assertion (as unknown as T)
const doubleAssertion = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed('some data'),
  Effect.flatMap((data) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing double type assertion
    const msg = data as unknown as ProtocolMessage;
    return Effect.succeed(msg.id);
  })
);

// Should NOT fail - type assertion outside Effect callback
const typeAssertionOutside = { type: 'command', id: '123' } as ProtocolMessage;

// Should NOT fail - no type assertion
const noTypeAssertion = pipe(
  // eslint-disable-next-line no-restricted-syntax -- Testing first arg in pipe
  Effect.succeed<ProtocolMessage>({ type: 'command', id: '123' }),
  Effect.map((msg) => msg.id)
);
