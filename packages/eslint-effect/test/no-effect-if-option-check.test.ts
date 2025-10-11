import { pipe, Option, Effect } from 'effect';

// Invalid: Effect.if with Option.isSome
// eslint-disable-next-line effect/no-effect-if-option-check
const badIsSome = Effect.if(Option.isSome(Option.some(1)), {
  onTrue: () => Effect.succeed(1),
  onFalse: () => Effect.succeed(0),
});

// Invalid: Effect.if with Option.isNone
// eslint-disable-next-line effect/no-effect-if-option-check
const badIsNone = Effect.if(Option.isNone(Option.none()), {
  onTrue: () => Effect.succeed(1),
  onFalse: () => Effect.succeed(0),
});

// Invalid: Effect.if with Option.isSome in pipe
const badInPipe = pipe(Option.some(42), (opt) =>
  // eslint-disable-next-line effect/no-effect-if-option-check
  Effect.if(Option.isSome(opt), {
    onTrue: () => Effect.succeed(1),
    onFalse: () => Effect.void,
  })
);

// Invalid: Effect.if with Option.isNone
const badIsNoneInPipe = pipe(Option.none(), (opt) =>
  // eslint-disable-next-line effect/no-effect-if-option-check
  Effect.if(Option.isNone(opt), {
    onTrue: () => Effect.succeed('none'),
    onFalse: () => Effect.succeed('some'),
  })
);

// Valid: Using Option.match instead
const goodMatch = pipe(
  Option.some(42),
  Option.match({
    onNone: () => Effect.void,
    onSome: (value) => Effect.succeed(value),
  })
);

// Valid: Effect.if with a different boolean check
const goodRegularCheck = Effect.if(true, {
  onTrue: () => Effect.succeed(1),
  onFalse: () => Effect.succeed(0),
});

// Valid: Effect.if with a variable boolean
const someBoolean = true;
const goodVariableCheck = Effect.if(someBoolean, {
  onTrue: () => Effect.succeed(1),
  onFalse: () => Effect.succeed(0),
});

// Valid: Effect.if with comparison
const goodComparison = Effect.if(1 > 0, {
  onTrue: () => Effect.succeed(1),
  onFalse: () => Effect.succeed(0),
});

// Valid: Option.isSome used outside Effect.if
const goodOptionCheckOutsideEffectIf = Option.isSome(Option.some(1));

// Valid: Using Option.match with Effects
const goodMatchWithEffects = pipe(
  Option.some(42),
  Option.match({
    onNone: () => Effect.fail('no value'),
    onSome: (value) => Effect.succeed(value * 2),
  })
);
