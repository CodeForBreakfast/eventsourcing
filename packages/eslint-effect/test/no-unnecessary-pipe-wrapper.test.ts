import { pipe, Effect } from 'effect';

const someFn = (x: number) => x * 2;

// eslint-disable-next-line effect/no-unnecessary-pipe-wrapper
const unnecessaryArrowWrapper = (value: number) => pipe(value, someFn);

// eslint-disable-next-line effect/no-unnecessary-pipe-wrapper
const unnecessaryEffectWrapper = (value: number) => pipe(value, Effect.succeed);

function unnecessaryFunctionWrapper(value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper
  return pipe(value, someFn);
}

const unnecessaryFunctionExpr = function (value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper
  return pipe(value, Effect.succeed);
};
