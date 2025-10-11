import { pipe, Effect } from 'effect';

const someFn = (x: number) => x * 2;

const unnecessaryArrowWrapper = (value: number) => pipe(value, someFn);

const unnecessaryEffectWrapper = (value: number) => pipe(value, Effect.succeed);

function unnecessaryFunctionWrapper(value: number) {
  return pipe(value, someFn);
}

const unnecessaryFunctionExpr = function (value: number) {
  return pipe(value, Effect.succeed);
};
