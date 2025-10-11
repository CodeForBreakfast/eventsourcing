import { pipe, Effect, Stream, PubSub, Queue } from 'effect';

// BAD: Storing Effect result before piping
const intermediate1 = Effect.succeed(42);
const result1 = pipe(
  intermediate1,
  Effect.map((x) => x + 1)
);

// BAD: Storing pipe result before using it in another function
const pipeResult = pipe(
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

const andThen = Effect.andThen(pipeResult, () => Effect.succeed('done'));

// BAD: The original problematic pattern from the user - storing PubSub result
const subscription = PubSub.unbounded<number>();
const subscriptionEffect = pipe(
  subscription,

  Effect.map((pubsub) => pubsub)
);

// BAD: Storing Stream result before using it
const stream1 = Stream.make(1, 2, 3);

const runCollect = Stream.runCollect(stream1);

// BAD: Storing Queue result before using it
const queue = Queue.unbounded<number>();

const queueOffer = Effect.andThen(queue, (q) => Queue.offer(q, 42));

// GOOD: Everything in one pipe chain
const good1 = pipe(
  Effect.succeed(42),
  Effect.map((x) => x + 1),
  Effect.andThen(() => Effect.succeed('done'))
);

// GOOD: Proper pipe composition with PubSub
const good2 = pipe(
  PubSub.unbounded<number>(),

  Effect.map((pubsub) => pubsub)
);

// GOOD: Direct use without intermediate variable
const good3 = Effect.andThen(
  pipe(
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
