import { pipe, Effect, Option, Stream } from 'effect';

const mapVoidZero = Effect.map(() => void 0);

const mapUndefined = Effect.map(() => undefined);

const mapEmptyBlock = Effect.map(() => {});

const mapVoidInPipe = pipe(
  Effect.succeed(42),

  Effect.map(() => void 0)
);

const mapUndefinedInPipe = pipe(
  Effect.succeed('hello'),

  Effect.map(() => undefined)
);

const optionMapVoid = Option.map(() => void 0);

const streamMapVoid = Stream.map(() => undefined);

const correctUsage = pipe(Effect.succeed(42), Effect.asVoid);

const correctOptionUsage = pipe(Option.some(42), Option.asVoid);

const mapWithParameter = pipe(
  Effect.succeed(42),
  Effect.map((x) => void 0)
);

const mapWithValue = pipe(
  Effect.succeed(42),

  Effect.map(() => 'hello')
);
