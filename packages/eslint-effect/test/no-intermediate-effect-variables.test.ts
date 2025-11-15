import { pipe, Effect, Stream, PubSub, Queue, Schedule } from 'effect';

/**
 * Rule behavior: no-intermediate-effect-variables
 *
 * FLAGGED (variables that should be inlined):
 * - First argument to pipe() → intermediate value being transformed
 * - Member expression like effect.pipe() → being transformed
 * - Property shorthand like { effect } → could be inlined
 *
 * NOT FLAGGED (legitimate variable usage):
 * - Non-first arguments to pipe() → configuration/data
 * - Arguments to Effect functions (retry, repeat, etc.) → configuration/data
 * - Array literals → configuration/data
 * - Function returns → configuration/data
 * - Ternary expressions → configuration/data
 * - Multiple usages → legitimate reuse
 *
 * The semantic clue: pipe position distinguishes transformation (first arg)
 * from configuration (all other positions).
 */

// BAD: Storing Effect result before piping
const intermediate1 = Effect.succeed(42);
const result1 = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables
  intermediate1,
  Effect.map((x) => x + 1)
);

// GOOD: pipeResult is not used as first arg to pipe()
// It's passed to Effect.andThen as a parameter, which is configuration/data usage
const pipeResult = pipe(
  Effect.succeed(42),
  Effect.map((x) => x + 1)
);

const andThen = Effect.andThen(pipeResult, () => Effect.succeed('done'));

// BAD: The original problematic pattern from the user - storing PubSub result
const subscription = PubSub.unbounded<number>();
const subscriptionEffect = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables
  subscription,

  Effect.map((pubsub) => pubsub)
);

// GOOD: stream1 is not used as first arg to pipe()
// It's passed to Stream.runCollect as a parameter
const stream1 = Stream.make(1, 2, 3);

const runCollect = Stream.runCollect(stream1);

// GOOD: queue is not used as first arg to pipe()
// It's passed to Effect.andThen as a parameter
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

// GOOD: Configuration constants used in non-pipe positions should NOT be flagged
// Test case 1: Schedule constant used in Effect.retry
const retrySchedule = pipe(
  Schedule.exponential('100 millis'),
  Schedule.union(Schedule.spaced('1 second'))
);
const retriedEffect = pipe(Effect.fail('test'), Effect.retry(retrySchedule));

// GOOD: Configuration constants used in Effect operations
// Test case 2: Schedule constant used in Effect.repeat
const repeatSchedule = Schedule.spaced('500 millis');
const repeatedEffect = pipe(Effect.succeed(42), Effect.repeat(repeatSchedule));

// GOOD: Match handlers as configuration data
// Test case 3: Effect handler used in ternary expression
const successHandler = Effect.succeed('handled');
const matchResult = pipe(
  Effect.succeed({ _tag: 'Success', value: 42 }),
  Effect.andThen((result) =>
    pipe(
      result,
      // Handler is passed as configuration, not transformed by pipe
      (r) => (r._tag === 'Success' ? successHandler : Effect.fail('nope'))
    )
  )
);

// BAD: Variable used in member expression (effect.pipe is being called)
const effect1 = Effect.succeed(42);
// eslint-disable-next-line effect/no-intermediate-effect-variables
const result4 = effect1.pipe(Effect.map((x) => x + 1));

// BAD: Variable used in Property shorthand (could be inlined)
const effect2 = Effect.succeed(42);
// eslint-disable-next-line effect/no-intermediate-effect-variables
const obj = { effect: effect2 };

// GOOD: Variable used in array literal (configuration data)
const effect3 = Effect.succeed(42);
const arr = [effect3];

// GOOD: Variable used as non-first arg to pipe() (configuration data)
const effect4 = Effect.succeed(42);
const result7 = pipe(
  Effect.succeed(1),
  Effect.zipWith(effect4, (a, b) => a + b)
);

// GOOD: Variable used in function call (configuration data)
const effect5 = Effect.succeed(42);
const result8 = Effect.all([effect5]);

// GOOD: Variable returned from arrow function (configuration data)
const effect6 = Effect.succeed(42);
const factory = () => effect6;

// GOOD: Variable used multiple times (legitimate reuse)
const effect7 = Effect.succeed(42);
const multi1 = pipe(
  effect7,
  Effect.map((x) => x + 1)
);
const multi2 = pipe(
  effect7,
  Effect.map((x) => x * 2)
);
