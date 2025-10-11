import { Either } from 'effect';

const either = Either.right(42);

type Event =
  | { readonly type: 'Created'; readonly name: string }
  | { readonly type: 'Updated'; readonly name: string };
const event: Event = { type: 'Created', name: 'test' } as Event;

switch (either._tag) {
  case 'Right':
    break;
  case 'Left':
    break;
}

switch (event.type) {
  case 'Created':
    break;
  case 'Updated':
    break;
  default:
    break;
}

switch ('foo' as string) {
  case 'foo':
    break;
  case 'bar':
    break;
  default:
    break;
}

switch (42 as number) {
  case 42:
    break;
  case 0:
    break;
  default:
    break;
}
