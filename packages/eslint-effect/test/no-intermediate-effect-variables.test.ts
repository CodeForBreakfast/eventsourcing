import { pipe, Effect, Stream, PubSub, Queue } from 'effect';

// BAD: Storing Effect result before piping
const intermediate1 = Effect.succeed(42);
const result1 = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Testing intermediate variable ban
  intermediate1,
  Effect.map((x) => x + 1)
);

// BAD: Storing pipe result before using it in another function
const pipeResult = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Focus on testing intermediate variables
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);
// eslint-disable-next-line effect/no-intermediate-effect-variables -- Testing intermediate variable ban
const andThen = Effect.andThen(pipeResult, () => Effect.succeed('done'));

// BAD: The original problematic pattern from the user - storing PubSub result
const subscription = PubSub.unbounded<number>();
const subscriptionEffect = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Testing intermediate variable ban
  subscription,
  // eslint-disable-next-line effect/no-identity-transform -- Testing pattern, not transform quality
  Effect.map((pubsub) => pubsub)
);

// BAD: Storing Stream result before using it
const stream1 = Stream.make(1, 2, 3);
// eslint-disable-next-line effect/no-intermediate-effect-variables -- Testing intermediate variable ban
const runCollect = Stream.runCollect(stream1);

// BAD: Storing Queue result before using it
const queue = Queue.unbounded<number>();
// eslint-disable-next-line effect/no-intermediate-effect-variables -- Testing intermediate variable ban
const queueOffer = Effect.andThen(queue, (q) => Queue.offer(q, 42));

// GOOD: Everything in one pipe chain
const good1 = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Valid pattern: data-first composition
  Effect.succeed(42),
  Effect.map((x) => x + 1),
  Effect.andThen(() => Effect.succeed('done'))
);

// GOOD: Proper pipe composition with PubSub
const good2 = pipe(
  PubSub.unbounded<number>(),
  // eslint-disable-next-line effect/no-identity-transform -- Testing pattern, not transform quality
  Effect.map((pubsub) => pubsub)
);

// GOOD: Direct use without intermediate variable
const good3 = Effect.andThen(
  pipe(
    // eslint-disable-next-line effect/no-pipe-first-arg-call -- Valid pattern: nested composition
    Effect.succeed(42),
    Effect.map((x) => x + 1)
  ),
  () => Effect.succeed('done')
);

// GOOD: Stream composition
const good4 = pipe(Stream.make(1, 2, 3), Stream.runCollect);

// GOOD: Non-Effect variables are fine
const normalValue = 42;
const normalResult = Math.max(normalValue, 100);
