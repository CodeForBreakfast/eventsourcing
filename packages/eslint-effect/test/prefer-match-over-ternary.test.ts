import { pipe, Effect, Match, Option } from 'effect';

// Should fail - ternary with Effect calls in return statement
const ternaryWithEffect = (condition: boolean) => {
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary with Effect calls
  return condition ? Effect.succeed(42) : Effect.fail('error');
};

// Should fail - ternary with Effect calls in arrow function body
const arrowTernaryEffect = (condition: boolean) =>
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary in arrow function body
  condition ? Effect.succeed('yes') : Effect.succeed('no');

// Should fail - ternary with function calls in variable assignment
const ternaryFunctionCalls = (hasData: boolean) =>
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary with function calls in variable
  hasData ? createDataEffect() : handleNoData();

// Should NOT fail (yet) - ternary inside function argument (not in return/assignment position)
// This is a future enhancement - catching ternaries as function arguments
const ternaryInPipe = (events: readonly unknown[]) =>
  pipe(
    Effect.void,
    Effect.andThen(events.length > 0 ? formatTodoList(events) : Effect.succeed('empty'))
  );

// Should NOT fail (yet) - ternary selecting between Effect-typed parameters (not function calls)
// This is a future enhancement - detecting ternaries based on type information
const handleConditional = <E, R>(
  events: readonly unknown[],
  whenTrue: Effect.Effect<void, E, R>,
  whenFalse: Effect.Effect<void, E, R>
): Effect.Effect<void, E, R> => (events.length > 0 ? whenTrue : whenFalse);

// Should fail - ternary in variable declaration
const getTodoEffect = (title: string | undefined) => {
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary in variable declaration
  const result = title ? createTodo(title) : missingArgError('Title required');
  return result;
};

// Should fail - ternary with Option.some check
const optionalValue = (value: Option.Option<string>) =>
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary with Option check
  Option.isSome(value) ? processValue(value.value) : defaultValue();

// Should fail - ternary inside Effect.succeed (complex condition)
const ternaryInEffectSucceed = (condition: boolean) =>
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary inside Effect constructor with boolean
  Effect.succeed(condition ? 'yes' : 'no');

// Should fail - ternary inside Effect.fail (complex condition)
const ternaryInEffectFail = (hasError: boolean) =>
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary inside Effect.fail with boolean
  Effect.fail(hasError ? new Error('Critical') : new Error('Warning'));

// Should NOT fail - simple literal equality INSIDE Effect.succeed (no duplication)
const simpleLiteralInEffect = (id: string) => Effect.succeed(id === 'user-1' ? 'John' : 'Guest');

// Actually this is fine - both branches are function calls but not Effect calls
// The pattern is: status === 'active' ? fn() : fn() which is reasonable
const simpleLiteralWithCalls = (status: string) =>
  status === 'active' ? createActiveUser() : createInactiveUser();

// Should NOT fail - ternary with plain values (not function calls)
const plainValueTernary = (condition: boolean) => {
  return condition ? 42 : 0;
};

// Should NOT fail - ternary with string literals
const stringTernary = (condition: boolean) => (condition ? 'yes' : 'no');

// Should NOT fail - using Match.value instead (correct pattern)
const correctMatchPattern = (condition: boolean) =>
  pipe(
    // eslint-disable-next-line effect/no-pipe-first-arg-call -- Match.value(condition) is the correct usage pattern here
    Match.value(condition),
    Match.when(true, () => Effect.succeed(42)),
    Match.when(false, () => Effect.fail('error'))
  );

// Should NOT fail - using Option.match instead
const correctOptionMatch = (value: Option.Option<string>) =>
  // eslint-disable-next-line effect/no-unnecessary-pipe-wrapper -- Testing proper Match pattern usage
  pipe(
    value,
    Option.match({
      // eslint-disable-next-line effect/no-eta-expansion -- Testing Match pattern, not point-free style
      onNone: () => defaultValue(),
      // eslint-disable-next-line effect/no-eta-expansion -- Testing Match pattern, not point-free style
      onSome: (v) => processValue(v),
    })
  );

// Should NOT fail - ternary not in return position (intermediate calculation)
const intermediateCalculation = (x: number) => {
  const multiplier = x > 10 ? 2 : 1;
  return Effect.succeed(x * multiplier);
};

// Should fail - ternary inside Effect.succeed (even with plain values)
const ternaryAsArgument = (condition: boolean) => {
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing ternary inside Effect.succeed with plain values
  return Effect.succeed(condition ? 'a' : 'b');
};

// Should NOT fail - nested ternary with plain values
const nestedPlainTernary = (x: number) => (x > 10 ? (x > 20 ? 'high' : 'medium') : 'low');

// Helper functions for tests
const createDataEffect = () => Effect.succeed({ data: 'value' });
const handleNoData = () => Effect.succeed('no-data');
const formatTodoList = (events: readonly unknown[]) => Effect.succeed('formatted');
const createTodo = (title: string) => Effect.succeed({ title });
// eslint-disable-next-line effect/no-eta-expansion -- Simple test helper
const missingArgError = (msg: string) => Effect.fail(msg);
const processValue = (value: string) => Effect.succeed(value.toUpperCase());
const defaultValue = () => Effect.succeed('default');
const createActiveUser = () => Effect.succeed({ status: 'active' });
const createInactiveUser = () => Effect.succeed({ status: 'inactive' });
