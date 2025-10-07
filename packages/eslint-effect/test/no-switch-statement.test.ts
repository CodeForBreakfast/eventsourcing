import { Either } from 'effect';

const either = Either.right(42);

type Event =
  | { readonly type: 'Created'; readonly name: string }
  | { readonly type: 'Updated'; readonly name: string };
const event: Event = { type: 'Created', name: 'test' } as Event;

// eslint-disable-next-line effect/no-switch-statement, effect/no-direct-tag-access -- Testing switch on _tag
switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

// eslint-disable-next-line effect/no-switch-statement -- Testing switch on type discriminator
switch (event.type) {
  case 'Created':
    break;
  case 'Updated':
    break;
  default:
    break;
}

// eslint-disable-next-line effect/no-switch-statement -- Testing switch on any value
switch ('foo' as string) {
  case 'foo':
    break;
  case 'bar':
    break;
  default:
    break;
}

// eslint-disable-next-line effect/no-switch-statement -- Testing switch on number
switch (42 as number) {
  case 42:
    break;
  case 0:
    break;
  default:
    break;
}
