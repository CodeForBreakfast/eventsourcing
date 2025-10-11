import { Effect, Either, Option } from 'effect';

const either = Either.right(42);
const option = Option.some(42);
const condition = true;
const state = { deleted: false };

type Event =
  | { readonly type: 'TodoCreated'; readonly data: { readonly title: string } }
  | { readonly type: 'TodoCompleted' };

const event: Event = { type: 'TodoCreated', data: { title: 'test' } };

if (either._tag === 'Right') {
  console.log(either.right);
}

if (event.type === 'TodoCreated') {
  console.log(event.data.title);
}

if (state.deleted) {
  Effect.fail(new Error('Cannot complete deleted TODO'));
} else {
  Effect.succeed(state);
}

if (Option.isSome(option)) {
  console.log(option.value);
} else {
  console.log('default');
}

if (condition) {
  console.log('true branch');
} else {
  console.log('false branch');
}

const event2: Event = { type: 'TodoCompleted' };

if (event2.type === 'TodoCompleted') {
  console.log('completed');
}

// Ternary operators are allowed (mentioned in the rule documentation)
const result = condition ? 'yes' : 'no';
