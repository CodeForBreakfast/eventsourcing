import { pipe } from 'effect';

const nestedPipe = pipe(
  42,

  (x) => pipe(x, (y) => y + 1)
);
