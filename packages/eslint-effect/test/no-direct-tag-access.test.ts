import { Either, Option } from 'effect';

const either = Either.right(42);
const option = Option.some(42);

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison rule
if (either._tag === 'Right') {
  // eslint-disable-next-line effect/prefer-effect-platform -- Test file uses console
  console.log('right');
}

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison on Option
if (option._tag === 'Some') {
  // eslint-disable-next-line effect/prefer-effect-platform -- Test file uses console
  console.log('some');
}

// eslint-disable-next-line effect/no-direct-tag-access, effect/prefer-effect-platform -- Testing _tag in ternary, test file uses console
console.log(either._tag === 'Left' ? 'left' : 'right');

// eslint-disable-next-line effect/no-switch-statement, effect/no-direct-tag-access -- Testing switch on _tag
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line effect/no-direct-tag-access -- Testing _tag comparison on right side
if ('Right' === either._tag) {
  // eslint-disable-next-line effect/prefer-effect-platform -- Test file uses console
  console.log('right');
}
