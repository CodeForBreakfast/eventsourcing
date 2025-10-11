import { Either, Option } from 'effect';

const either = Either.right(42);
const option = Option.some(42);

if (either._tag === 'Right') {
  console.log('right');
}

if (option._tag === 'Some') {
  console.log('some');
}

console.log(either._tag === 'Left' ? 'left' : 'right');

switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

if ('Right' === either._tag) {
  console.log('right');
}
