import { Either } from 'effect';

const either = Either.right(42);

type Event = { type: 'Created'; name: string } | { type: 'Updated'; name: string };
const event: Event = { type: 'Created', name: 'test' };

// eslint-disable-next-line effect/no-switch-on-tag -- Testing switch on _tag
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line effect/no-switch-on-tag -- Testing switch on type discriminator
switch (event.type) {
  case 'Created':
    break;
  case 'Updated':
    break;
}

// eslint-disable-next-line effect/no-switch-on-tag -- Testing switch on any value
switch ('foo') {
  case 'foo':
    break;
  case 'bar':
    break;
}

// eslint-disable-next-line effect/no-switch-on-tag -- Testing switch on number
switch (42) {
  case 42:
    break;
  case 0:
    break;
}
