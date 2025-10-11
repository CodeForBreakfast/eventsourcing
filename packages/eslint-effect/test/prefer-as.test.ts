import { pipe, Effect, Option, Stream, Schedule, Channel, STM, Sink, Cause } from 'effect';

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with string constant
const effectMapString = Effect.map(() => 'constant');

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with number constant
const effectMapNumber = Effect.map(() => 42);

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with boolean constant
const effectMapBoolean = Effect.map(() => true);

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with null
const effectMapNull = Effect.map(() => null);

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with object literal
const effectMapObject = Effect.map(() => ({ key: 'value' }));

// eslint-disable-next-line effect/prefer-as -- Testing Effect.map with array literal
const effectMapArray = Effect.map(() => [1, 2, 3]);

const effectMapInPipe = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as -- Testing map in pipe
  Effect.map(() => 'constant')
);

// eslint-disable-next-line effect/prefer-as -- Testing Option.map
const optionMap = Option.map(() => 'value');

// eslint-disable-next-line effect/prefer-as -- Testing Stream.map
const streamMap = Stream.map(() => 123);

// eslint-disable-next-line effect/prefer-as -- Testing Schedule.map
const scheduleMap = Schedule.map(() => 'done');

// eslint-disable-next-line effect/prefer-as -- Testing Channel.map
const channelMap = Channel.map(() => 'result');

// eslint-disable-next-line effect/prefer-as -- Testing STM.map
const stmMap = STM.map(() => 999);

// eslint-disable-next-line effect/prefer-as -- Testing Sink.map
const sinkMap = Sink.map(() => 'sink-value');

// eslint-disable-next-line effect/prefer-as -- Testing Cause.map
const causeMap = Cause.map(() => 'cause-value');

const correctUsageAs = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.as('constant')
);

const correctOptionAs = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Option.some(42),
  Option.as('value')
);

const mapWithParameter = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.map((x) => x * 2)
);

const mapWithParameterUsed = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.map((x) => `Value: ${x}`)
);

const mapWithVoidShouldUseAsVoid = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-void -- Testing that prefer-as doesn't trigger for void
  Effect.map(() => void 0)
);

const mapWithUndefinedShouldUseAsVoid = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-void -- Testing that prefer-as doesn't trigger for undefined
  Effect.map(() => undefined)
);

const mapWithEmptyBlockShouldUseAsVoid = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as-void -- Testing that prefer-as doesn't trigger for empty block
  Effect.map(() => {})
);

const mapWithBlockStatement = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(42),
  Effect.map(() => {
    return 'value';
  })
);

const innerEffect = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing nested first arg
  Effect.succeed(2),
  // eslint-disable-next-line effect/prefer-as -- Testing nested constant
  Effect.map(() => 3)
);

const nestedPipes = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(1),
  // eslint-disable-next-line effect/prefer-as -- Testing nested pipe
  Effect.map(() => innerEffect)
);
