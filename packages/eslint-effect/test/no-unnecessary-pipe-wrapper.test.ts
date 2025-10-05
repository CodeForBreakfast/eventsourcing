import { pipe, Effect } from 'effect';

const someFn = (x: number) => x * 2;

const unnecessaryArrowWrapper = (value: number) =>
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper
  pipe(value, someFn);

const unnecessaryEffectWrapper = (value: number) =>
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary arrow pipe wrapper with Effect
  pipe(value, Effect.succeed);

function unnecessaryFunctionWrapper(value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary function declaration pipe wrapper
  return pipe(value, someFn);
}

const unnecessaryFunctionExpr = function (value: number) {
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing unnecessary function expression pipe wrapper
  return pipe(value, Effect.succeed);
};
