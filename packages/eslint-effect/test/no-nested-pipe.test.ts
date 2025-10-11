import { pipe } from 'effect';

const nestedPipe = pipe(
  42,
  // eslint-disable-next-line effect/no-nested-pipe
  (x) => pipe(x, (y) => y + 1)
);
