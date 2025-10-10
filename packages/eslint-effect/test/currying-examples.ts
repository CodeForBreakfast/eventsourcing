import { Effect } from 'effect';

/**
 * Examples demonstrating the improved suggest-currying-opportunity rule behavior
 */

// =============================================================================
// GOOD: Rule WILL suggest currying (params already at end)
// =============================================================================

const logError = (message: string, error: unknown): Effect.Effect<void> =>
  // eslint-disable-next-line effect/prefer-effect-platform -- Example function
  Effect.sync(() => console.error(message, error));

const myEffect = Effect.succeed('test');

// This SHOULD trigger a warning because params are already at end (good currying opportunity)
// eslint-disable-next-line effect/suggest-currying-opportunity -- Intentionally triggering to verify rule works
const example1 = Effect.catchAll(myEffect, (error) => logError('Failed', error));

// =============================================================================
// FILTERED OUT: Would require parameter reordering (semantic order breaking)
// =============================================================================

const logErrorWrongOrder = (error: unknown, message: string): Effect.Effect<void> =>
  // eslint-disable-next-line effect/prefer-effect-platform -- Example function
  Effect.sync(() => console.error(message, error));

// Rule won't suggest because param (error) comes first, not last
// Would require changing signature from (error, message) to (message, error)
// This breaks semantic ordering
const example2 = Effect.catchAll(myEffect, (error) => logErrorWrongOrder(error, 'Failed'));

// =============================================================================
// FILTERED OUT: Would create multi-level currying (too deep)
// =============================================================================

const processData = (prefix: string, suffix: string, data: string): string =>
  `${prefix}${data}${suffix}`;

// Rule won't suggest because it would create 2-level currying:
// processData = (prefix) => (suffix) => (data) => ...
// Call site would be: processData('prefix')('suffix') - too many parens
const example3 = Effect.map(Effect.succeed('test'), (data) =>
  processData('prefix-', '-suffix', data)
);

// =============================================================================
// FILTERED OUT: Would create triple currying (way too deep)
// =============================================================================

const validateInRange = (min: number, max: number, label: string, value: number): boolean =>
  value >= min && value <= max;

// This would create 3-level currying - absolutely not!
const example4 = Effect.map(Effect.succeed(50), (value) =>
  validateInRange(0, 100, 'percentage', value)
);

// =============================================================================
// VALID: Not triggered (library function)
// =============================================================================

// Rule doesn't trigger on Effect library functions
// eslint-disable-next-line effect/no-eta-expansion -- Testing currying rule, not eta-expansion
const validExample1 = Effect.flatMap(myEffect, (x) => Effect.succeed(x));

// =============================================================================
// VALID: Not triggered (param in middle position)
// =============================================================================

// Param 'x' is in the middle, not at the end - would require reordering
const validExample2 = Effect.map(myEffect, (x) => processData('static', x, 'suffix'));

// =============================================================================
// VALID: Not triggered (param used differently)
// =============================================================================

type ErrorWithMessage = { readonly error: string };

// Param not passed through directly - uses property access
const validExample3 = Effect.map(Effect.succeed<ErrorWithMessage>({ error: 'test' }), (x) =>
  logError('message', x.error)
);
