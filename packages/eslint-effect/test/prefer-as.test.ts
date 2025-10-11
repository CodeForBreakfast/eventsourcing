import { pipe, Effect, Option, Stream, Schedule, Channel, STM, Sink, Cause } from 'effect';

const effectMapString = Effect.map(() => 'constant');

const effectMapNumber = Effect.map(() => 42);

const effectMapBoolean = Effect.map(() => true);

const effectMapNull = Effect.map(() => null);

const effectMapObject = Effect.map(() => ({ key: 'value' }));

const effectMapArray = Effect.map(() => [1, 2, 3]);

const effectMapInPipe = pipe(
  Effect.succeed(42),

  Effect.map(() => 'constant')
);

const optionMap = Option.map(() => 'value');

const streamMap = Stream.map(() => 123);

const scheduleMap = Schedule.map(() => 'done');

const channelMap = Channel.map(() => 'result');

const stmMap = STM.map(() => 999);

const sinkMap = Sink.map(() => 'sink-value');

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

  Effect.map(() => 3)
);

const nestedPipes = pipe(
  Effect.succeed(1),

  Effect.map(() => innerEffect)
);
