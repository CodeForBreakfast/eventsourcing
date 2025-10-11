import { Either, Option } from 'effect';

const either = Either.right(42);
const option = Option.some(42);

// eslint-disable-next-line effect/no-direct-tag-access
if (either._tag === 'Right') {
  console.log('right');
}

// eslint-disable-next-line effect/no-direct-tag-access
if (option._tag === 'Some') {
  console.log('some');
}

// eslint-disable-next-line effect/no-direct-tag-access
console.log(either._tag === 'Left' ? 'left' : 'right');

// eslint-disable-next-line effect/no-direct-tag-access
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line effect/no-direct-tag-access
if ('Right' === either._tag) {
  console.log('right');
}
