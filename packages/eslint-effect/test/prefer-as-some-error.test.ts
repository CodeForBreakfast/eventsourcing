import { pipe, Effect, Option } from 'effect';

// eslint-disable-next-line effect/prefer-as-some-error
const effectMapErrorOptionSome = Effect.mapError(Option.some);

const effectMapErrorInPipe = pipe(
  Effect.fail('error'),
  // eslint-disable-next-line effect/prefer-as-some-error
  Effect.mapError(Option.some)
);

const nestedPipe = pipe(
  Effect.fail('error'),
  Effect.mapError((e) => `Error: ${e}`),
  // eslint-disable-next-line effect/prefer-as-some-error
  Effect.mapError(Option.some)
);

const correctUsageAsSomeError = pipe(Effect.fail('error'), Effect.asSomeError);

const correctAsSomeErrorDirectCall = Effect.asSomeError;

const mapErrorWithDifferentFunction = pipe(
  Effect.fail('error'),
  Effect.mapError((e) => `Error: ${e}`)
);

const mapErrorWithArrowFunction = pipe(
  Effect.fail('error'),
  Effect.mapError((e) => Option.some(e))
);

const mapErrorWithOptionNone = pipe(Effect.fail('error'), Effect.mapError(Option.none));

const mapErrorWithCustomFunction = pipe(
  Effect.fail('error'),
  Effect.mapError((e) => {
    return Option.some(e);
  })
);

const mapErrorWithTransformation = pipe(
  Effect.fail('error'),
  Effect.mapError((e) => Option.some(`Error: ${e}`))
);

const chainedEffect = pipe(
  Effect.fail('error'),
  // eslint-disable-next-line effect/prefer-as-some-error
  Effect.mapError(Option.some),
  Effect.catchAll((opt) =>
    Option.match(opt, {
      onNone: () => Effect.fail('unknown error'),
      onSome: (e) => Effect.fail(e),
    })
  )
);

const complexPipe = pipe(
  Effect.fail({ code: 'ERR_001', message: 'test error' }),
  Effect.mapError((err) => err.message),
  // eslint-disable-next-line effect/prefer-as-some-error
  Effect.mapError(Option.some)
);

const mapWithOptionSome = pipe(Effect.succeed(42), Effect.map(Option.some));

const mixedMapAndMapError = pipe(
  Effect.fail('error'),
  // eslint-disable-next-line effect/prefer-as-some-error
  Effect.mapError(Option.some),
  Effect.map((x) => x * 2)
);
