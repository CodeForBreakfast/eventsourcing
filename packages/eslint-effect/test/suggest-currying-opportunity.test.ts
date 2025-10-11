import { Effect } from 'effect';

const logHandlerError = (message: string, error: unknown): Effect.Effect<void> => {
  return Effect.sync(() => console.log(message, error));
};

const logHandlerErrorWrongOrder = (error: unknown, message: string): Effect.Effect<void> => {
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

const handleError1 = Effect.catchAll(myEffect, (error) =>
  logHandlerError('Failed to process', error)
);

// Params already at end - no reordering needed

const handleError2 = Effect.catchAll(myEffect, (error: unknown) =>
  logHandlerError('Failed with context', error)
);

// Would create 2-level currying - filtered out by maxCurriedParams default
const processWithPrefix = Effect.map(myEffect, (data: string) =>
  processData('prefix-', '-suffix', data)
);

// Would create 2-level currying - filtered out by maxCurriedParams default
const validateValue = Effect.map(Effect.succeed(50), (value: number) =>
  validateWithContext(0, 100, value)
);

// Needs reordering (param comes first) - filtered out by default (allowReordering: false)
const handleError3 = Effect.catchAll(myEffect, (error: unknown) =>
  logHandlerErrorWrongOrder(error, 'Failed to process')
);

// Needs reordering (param comes first) - filtered out by default (allowReordering: false)
const processWithPrefixReorder = Effect.map(myEffect, (data: string) =>
  processDataWrongOrder(data, 'prefix-', '-suffix')
);

// Valid patterns that should NOT trigger the rule:

// Already properly curried or doesn't fit the pattern
const validPattern1 = Effect.map(myEffect, (x: string) => x.length * 2);

// Using Effect library function - should not suggest currying

const validPattern2 = Effect.flatMap(myEffect, (x: string) => Effect.succeed(x));

// Param in the middle - would require reordering (filtered out by default)
const validPattern3 = Effect.map(myEffect, (x: string) => processData('static', x, 'suffix'));

// Param not passed through directly - uses property access
const validPattern4 = Effect.map(
  Effect.succeed<ErrorWithMessage>({ error: 'test' }),
  (x: ErrorWithMessage) => logHandlerError('message', x.error)
);
