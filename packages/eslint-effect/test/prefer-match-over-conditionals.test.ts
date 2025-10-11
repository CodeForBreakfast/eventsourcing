import { pipe, Effect, Match } from 'effect';

type MessageType =
  | { readonly _tag: 'Command'; readonly id: string }
  | { readonly _tag: 'Subscribe'; readonly streamId: string }
  | { readonly _tag: 'Unsubscribe'; readonly streamId: string };

const handleCommand = (msg: { readonly _tag: 'Command'; readonly id: string }) =>
  Effect.succeed(msg.id);
const handleSubscribe = (msg: { readonly _tag: 'Subscribe'; readonly streamId: string }) =>
  Effect.succeed(msg.streamId);

const handleMessage = (msg: MessageType) => Effect.succeed(msg);

// Should fail - if statement in Effect.flatMap checking _tag discriminator
const imperativeFlatMap = pipe(
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals
    if (msg._tag === 'Command') {
      return handleMessage(msg);
    }
    // eslint-disable-next-line effect/prefer-match-over-conditionals
    if (msg._tag === 'Subscribe') {
      return handleMessage(msg);
    }
    return Effect.void;
  })
);

// Should fail - if statement in Effect.map checking _tag discriminator
const either = { _tag: 'Right' as const, right: 42 };
const imperativeMap = pipe(
  Effect.succeed(either),
  Effect.map((e) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals
    if (e._tag === 'Right') {
      return e.right;
    }
    return 0;
  })
);

// Should fail - reverse condition order (literal first)
const imperativeReverse = pipe(
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-match-over-conditionals
    if ('Command' === msg._tag) {
      return handleMessage(msg);
    }
    return Effect.void;
  })
);

// Should NOT fail - using Match.value pattern correctly
const functionalMatch = pipe(
  Effect.succeed<MessageType>({ _tag: 'Command', id: '123' }),
  Effect.flatMap((msg) =>
    pipe(
      msg,
      Match.value,
      Match.tag('Command', handleCommand),
      Match.tag('Subscribe', handleSubscribe),
      Match.orElse(() => Effect.void)
    )
  )
);

// Should NOT fail - if statement checking non-discriminator property
const nonDiscriminatorCheck = pipe(
  Effect.succeed({ name: 'test', value: 42 }),
  Effect.flatMap((obj) => {
    if (obj.value > 10) {
      return Effect.succeed(obj.name);
    }
    return Effect.succeed('default');
  })
);
