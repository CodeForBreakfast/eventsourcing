import { pipe } from 'effect';

const nestedPipe = pipe(
  42,
  // eslint-disable-next-line effect/no-nested-pipe, effect/no-unnecessary-pipe-wrapper -- Testing nested pipe ban (also unnecessary wrapper)
  (x) => pipe(x, (y) => y + 1)
);
