import { pipe } from 'effect';
import { constVoid } from 'effect/Function';
import * as Effect from 'effect/Effect';
import * as STM from 'effect/STM';

declare const myEffect: Effect.Effect<number, string, never>;
declare const mySTM: STM.STM<number, string, never>;

// Valid: Already using ignore
const _unused1 = pipe(myEffect, Effect.ignore);
const _unused2 = pipe(mySTM, STM.ignore);

// Valid: match with non-void handlers
const _unused3 = pipe(
  myEffect,
  Effect.match({
    onFailure: (e) => `Error: ${e}`,
    onSuccess: (n) => `Success: ${n}`,
  })
);

// Valid: match with only one void handler
const _unused4 = pipe(
  myEffect,
  Effect.match({
    onFailure: constVoid,
    onSuccess: (n) => n * 2,
  })
);

const _unused5 = pipe(
  myEffect,
  Effect.match({
    onFailure: (e) => e.length,
    onSuccess: constVoid,
  })
);

// Valid: match with arrow function that returns a value (not void)
const _unused6 = pipe(
  myEffect,
  Effect.match({
    onFailure: () => 'error',
    onSuccess: () => 'success',
  })
);

// Invalid: match with constVoid for both handlers
const _unused7 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: constVoid,
    onSuccess: constVoid,
  })
);

// Invalid: match with arrow functions returning void 0
const _unused8 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => void 0,
    onSuccess: () => void 0,
  })
);

// Invalid: match with arrow functions returning undefined
const _unused9 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => undefined,
    onSuccess: () => undefined,
  })
);

// Invalid: match with arrow functions with parameters returning void 0
const _unused10 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: (_) => void 0,
    onSuccess: (_) => void 0,
  })
);

// Invalid: match with arrow functions with empty block
const _unused11 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => {},
    onSuccess: () => {},
  })
);

// Invalid: STM with constVoid
const _unused12 = pipe(
  mySTM,
  // eslint-disable-next-line effect/prefer-ignore
  STM.match({
    onFailure: constVoid,
    onSuccess: constVoid,
  })
);

// Invalid: Mixed styles (constVoid and arrow function)
const _unused13 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: constVoid,
    onSuccess: () => void 0,
  })
);

// Invalid: Mixed styles (arrow functions returning different void representations)
const _unused14 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => undefined,
    onSuccess: () => {},
  })
);
