import { pipe, Effect, Option, Stream, Schedule, Channel, STM, Sink, Cause } from 'effect';

// eslint-disable-next-line effect/prefer-as
const effectMapString = Effect.map(() => 'constant');

// eslint-disable-next-line effect/prefer-as
const effectMapNumber = Effect.map(() => 42);

// eslint-disable-next-line effect/prefer-as
const effectMapBoolean = Effect.map(() => true);

// eslint-disable-next-line effect/prefer-as
const effectMapNull = Effect.map(() => null);

// eslint-disable-next-line effect/prefer-as
const effectMapObject = Effect.map(() => ({ key: 'value' }));

// eslint-disable-next-line effect/prefer-as
const effectMapArray = Effect.map(() => [1, 2, 3]);

const effectMapInPipe = pipe(
  Effect.succeed(42),
  // eslint-disable-next-line effect/prefer-as
  Effect.map(() => 'constant')
);

// eslint-disable-next-line effect/prefer-as
const optionMap = Option.map(() => 'value');

// eslint-disable-next-line effect/prefer-as
const streamMap = Stream.map(() => 123);

// eslint-disable-next-line effect/prefer-as
const scheduleMap = Schedule.map(() => 'done');

// eslint-disable-next-line effect/prefer-as
const channelMap = Channel.map(() => 'result');

// eslint-disable-next-line effect/prefer-as
const stmMap = STM.map(() => 999);

// eslint-disable-next-line effect/prefer-as
const sinkMap = Sink.map(() => 'sink-value');

// eslint-disable-next-line effect/prefer-as
const causeMap = Cause.map(() => 'cause-value');

const correctUsageAs = pipe(Effect.succeed(42), Effect.as('constant'));

const correctOptionAs = pipe(Option.some(42), Option.as('value'));

const mapWithParameter = pipe(
  Effect.succeed(42),
  Effect.map((x) => x * 2)
);

const mapWithParameterUsed = pipe(
  Effect.succeed(42),
  Effect.map((x) => `Value: ${x}`)
);

const mapWithVoidShouldUseAsVoid = pipe(
  Effect.succeed(42),

  Effect.map(() => void 0)
);

const mapWithUndefinedShouldUseAsVoid = pipe(
  Effect.succeed(42),

  Effect.map(() => undefined)
);

const mapWithEmptyBlockShouldUseAsVoid = pipe(
  Effect.succeed(42),

  Effect.map(() => {})
);

const mapWithBlockStatement = pipe(
  Effect.succeed(42),
  Effect.map(() => {
    return 'value';
  })
);

const innerEffect = pipe(
  Effect.succeed(2),
  // eslint-disable-next-line effect/prefer-as
  Effect.map(() => 3)
);

const nestedPipes = pipe(
  Effect.succeed(1),
  // eslint-disable-next-line effect/prefer-as
  Effect.map(() => innerEffect)
);
