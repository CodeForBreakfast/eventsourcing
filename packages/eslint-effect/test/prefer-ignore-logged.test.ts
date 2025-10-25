import { pipe } from 'effect';
import * as Effect from 'effect/Effect';

declare const myEffect: Effect.Effect<number, string, never>;

// Valid: Already using ignoreLogged
const _valid1 = pipe(myEffect, Effect.ignoreLogged);

// Valid: matchCauseEffect with non-logging onFailure
const _valid2 = pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.fail('recovered'),
    onSuccess: () => Effect.void,
  })
);

// Valid: matchCauseEffect with non-void onSuccess
const _valid3 = pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: (value) => Effect.succeed(value * 2),
  })
);

// Valid: matchCauseEffect without logging
const _valid4 = pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.die(cause),
    onSuccess: () => Effect.void,
  })
);

// Valid: Different logging level
const _valid5 = pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logError(cause),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug on failure and void on success
const _invalid1 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and message
const _invalid2 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause, 'error message'),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and arrow function with nested Effect.void
const _invalid3 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: (_value) => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and block statement returning Effect.void
const _invalid4 = pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => {
      return Effect.logDebug(cause);
    },
    onSuccess: () => Effect.void,
  })
);
