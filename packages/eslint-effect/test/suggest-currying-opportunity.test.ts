import { Effect } from 'effect';

const logHandlerError = (message: string, error: unknown): Effect.Effect<void> => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Test utility function
  return Effect.sync(() => console.log(message, error));
};

const logHandlerErrorWrongOrder = (error: unknown, message: string): Effect.Effect<void> => {
  // eslint-disable-next-line effect/prefer-effect-platform -- Test utility function
  return Effect.sync(() => console.log(message, error));
};

const processData = (prefix: string, suffix: string, data: string): string => {
  return `${prefix}${data}${suffix}`;
};

const processDataWrongOrder = (data: string, prefix: string, suffix: string): string => {
  return `${prefix}${data}${suffix}`;
};

const validateWithContext = (min: number, max: number, value: number): boolean => {
  return value >= min && value <= max;
};

type ErrorWithMessage = { readonly error: string };

const myEffect = Effect.succeed('test');

// Params already at end - no reordering needed
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity with single curried arg
const handleError1 = Effect.catchAll(myEffect, (error) =>
  logHandlerError('Failed to process', error)
);

// Params already at end - no reordering needed
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity with message arg
const handleError2 = Effect.catchAll(myEffect, (error: unknown) =>
  logHandlerError('Failed with context', error)
);

// Params already at end - no reordering needed
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity in map
const processWithPrefix = Effect.map(myEffect, (data: string) =>
  processData('prefix-', '-suffix', data)
);

// Params already at end - no reordering needed
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity with multiple curried args
const validateValue = Effect.map(Effect.succeed(50), (value: number) =>
  validateWithContext(0, 100, value)
);

// NEEDS REORDERING - params come first
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity requiring reordering
const handleError3 = Effect.catchAll(myEffect, (error: unknown) =>
  logHandlerErrorWrongOrder(error, 'Failed to process')
);

// NEEDS REORDERING - params come first
// eslint-disable-next-line effect/suggest-currying-opportunity -- Testing currying opportunity requiring reordering
const processWithPrefixReorder = Effect.map(myEffect, (data: string) =>
  processDataWrongOrder(data, 'prefix-', '-suffix')
);

// Valid patterns that should NOT trigger the rule:

// Already properly curried or doesn't fit the pattern
const validPattern1 = Effect.map(myEffect, (x: string) => x.length * 2);

// Using Effect library function - should not suggest currying
const validPattern2 = Effect.flatMap(myEffect, (x: string) => Effect.succeed(x));

// Param in the middle - would require reordering
// eslint-disable-next-line effect/suggest-currying-opportunity -- Demonstrates currying opportunity when param is in middle
const validPattern3 = Effect.map(myEffect, (x: string) => processData('static', x, 'suffix'));

// Param not passed through directly - uses property access
const validPattern4 = Effect.map(
  Effect.succeed<ErrorWithMessage>({ error: 'test' }),
  (x: ErrorWithMessage) => logHandlerError('message', x.error)
);
