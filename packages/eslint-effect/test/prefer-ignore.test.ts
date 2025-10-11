import { pipe } from 'effect';
import { constVoid } from 'effect/Function';
import * as Effect from 'effect/Effect';
import * as STM from 'effect/STM';

declare const myEffect: Effect.Effect<number, string, never>;
declare const mySTM: STM.STM<number, string, never>;

// Valid: Already using ignore
pipe(myEffect, Effect.ignore);
pipe(mySTM, STM.ignore);

// Valid: match with non-void handlers
pipe(
  myEffect,
  Effect.match({
    onFailure: (e) => `Error: ${e}`,
    onSuccess: (n) => `Success: ${n}`,
  })
);

// Valid: match with only one void handler
pipe(
  myEffect,
  Effect.match({
    onFailure: constVoid,
    onSuccess: (n) => n * 2,
  })
);

pipe(
  myEffect,
  Effect.match({
    onFailure: (e) => e.length,
    onSuccess: constVoid,
  })
);

// Valid: match with arrow function that returns a value (not void)
pipe(
  myEffect,
  Effect.match({
    onFailure: () => 'error',
    onSuccess: () => 'success',
  })
);

// Invalid: match with constVoid for both handlers
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: constVoid,
    onSuccess: constVoid,
  })
);

// Invalid: match with arrow functions returning void 0
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => void 0,
    onSuccess: () => void 0,
  })
);

// Invalid: match with arrow functions returning undefined
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => undefined,
    onSuccess: () => undefined,
  })
);

// Invalid: match with arrow functions with parameters returning void 0
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: (_) => void 0,
    onSuccess: (_) => void 0,
  })
);

// Invalid: match with arrow functions with empty block
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => {},
    onSuccess: () => {},
  })
);

// Invalid: STM with constVoid
pipe(
  mySTM,
  // eslint-disable-next-line effect/prefer-ignore
  STM.match({
    onFailure: constVoid,
    onSuccess: constVoid,
  })
);

// Invalid: Mixed styles (constVoid and arrow function)
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: constVoid,
    onSuccess: () => void 0,
  })
);

// Invalid: Mixed styles (arrow functions returning different void representations)
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore
  Effect.match({
    onFailure: () => undefined,
    onSuccess: () => {},
  })
);
