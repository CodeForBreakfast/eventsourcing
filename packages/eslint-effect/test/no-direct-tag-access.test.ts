import { Either, Option } from 'effect';

const either = Either.right(42);
const option = Option.some(42);

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison rule
if (either._tag === 'Right') {
  console.log('right');
}

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison on Option
if (option._tag === 'Some') {
  console.log('some');
}

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag in ternary
console.log(either._tag === 'Left' ? 'left' : 'right');

// eslint-disable-next-line effect/no-switch-on-tag, effect/no-direct-tag-access -- Testing switch on _tag
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison on right side
if ('Right' === either._tag) {
  console.log('right');
}
