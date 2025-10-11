import { pipe } from 'effect';
import * as Effect from 'effect/Effect';

declare const myEffect: Effect.Effect<number, string, never>;

// Valid: Already using ignoreLogged
pipe(myEffect, Effect.ignoreLogged);

// Valid: matchCauseEffect with non-logging onFailure
pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.fail('recovered'),
    onSuccess: () => Effect.void,
  })
);

// Valid: matchCauseEffect with non-void onSuccess
pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: (value) => Effect.succeed(value * 2),
  })
);

// Valid: matchCauseEffect without logging
pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.die(cause),
    onSuccess: () => Effect.void,
  })
);

// Valid: Different logging level
pipe(
  myEffect,
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logError(cause),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug on failure and void on success
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and message
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause, 'error message'),
    onSuccess: () => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and arrow function with nested Effect.void
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => Effect.logDebug(cause),
    onSuccess: (_value) => Effect.void,
  })
);

// Invalid: matchCauseEffect with logDebug and block statement returning Effect.void
pipe(
  myEffect,
  // eslint-disable-next-line effect/prefer-ignore-logged
  Effect.matchCauseEffect({
    onFailure: (cause) => {
      return Effect.logDebug(cause);
    },
    onSuccess: () => Effect.void,
  })
);
