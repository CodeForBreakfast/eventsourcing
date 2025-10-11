# @codeforbreakfast/eslint-effect

ESLint rules and configurations for Effect projects that enforce functional programming best practices and idiomatic Effect code patterns.

## Installation

```bash
npm install --save-dev @codeforbreakfast/eslint-effect
# or
bun add --dev @codeforbreakfast/eslint-effect
```

## Features

This package provides:

- **Custom ESLint Rules** for Effect-specific patterns
- **Syntax Restrictions** to enforce functional programming principles
- **Pre-configured Rule Sets** for different contexts
- **Functional Immutability Rules** tailored for Effect types

## Custom Rules

### `no-unnecessary-pipe-wrapper`

Detects unnecessary function wrappers around single pipe operations.

❌ Bad:

```typescript
const fn = (x) => pipe(x, transform);
```

✅ Good:

```typescript
const fn = transform;
```

### `no-eta-expansion`

Detects unnecessary function wrappers (eta-expansion) that only pass parameters directly to another function. Also known as "prefer point-free style."

❌ Bad:

```typescript
const logError = (msg: string) => Console.error(msg);
const transform = (x: number) => doSomething(x);
const handler = (a: string, b: number) => processData(a, b);
```

✅ Good:

```typescript
const logError = Console.error;
const transform = doSomething;
const handler = processData;
```

**Rationale**: In functional programming, eta-reduction (λx.f(x) → f) eliminates unnecessary indirection. When a function only passes its parameters directly to another function without any transformation, the wrapper adds no value and reduces readability.

### `no-unnecessary-function-alias`

Detects unnecessary function aliases that provide no semantic value. When a constant is assigned directly to another function without adding clarity or abstraction, it should be inlined at the call site.

❌ Bad:

```typescript
const getState = Ref.get;
const transform = Array.map;

// Used only once or twice
useOnce(getState(ref));
useTwice(transform((x) => x * 2, arr));
```

✅ Good:

```typescript
// Inline when used infrequently
useOnce(Ref.get(ref));
useTwice(Array.map((x) => x * 2, arr));

// OR keep the alias if it adds semantic value
// eslint-disable-next-line effect/no-unnecessary-function-alias -- Alias clarifies stream processing context
const collectStreamResults = Stream.runCollect;
```

**Configuration:**

- `maxReferences` (default: `2`) - Maximum number of references before alias is considered justified

```javascript
{
  rules: {
    'effect/no-unnecessary-function-alias': ['warn', {
      maxReferences: 3,  // Allow aliases used 3+ times
    }]
  }
}
```

**Rationale**: Function aliases that are used only once or twice add cognitive overhead without meaningful benefit. They force readers to jump between the alias definition and usage site. Direct function calls are more straightforward. However, aliases that are used frequently (3+ times) or that add semantic clarity through their name should be kept.

### `prefer-match-tag`

Enforces `Match.tag()` over `Match.when()` for `_tag` discriminators.

❌ Bad:

```typescript
Match.when({ _tag: 'Success' }, handler);
```

✅ Good:

```typescript
Match.tag('Success', handler);
```

### `prefer-match-over-conditionals`

Encourages declarative `Match` patterns over imperative `if` statements in Effect callbacks.

❌ Bad:

```typescript
Effect.flatMap((x) => {
  if (x._tag === 'Success') return handleSuccess(x);
  return handleError(x);
});
```

✅ Good:

```typescript
Effect.flatMap(Match.value, Match.tag('Success', handleSuccess), Match.orElse(handleError));
```

### `prefer-effect-if-over-match-boolean`

Enforces `Effect.if` over `Match.value` for boolean conditionals. `Match.value` should be reserved for pattern matching on multiple values, not simple true/false branches.

❌ Bad:

```typescript
pipe(
  isValid,
  Match.value,
  Match.when(true, () => Effect.succeed('valid')),
  Match.when(false, () => Effect.fail('invalid')),
  Match.exhaustive
);

pipe(
  user.isAdmin,
  Match.value,
  Match.when(true, () => grantAccess()),
  Match.when(false, () => denyAccess()),
  Match.exhaustive
);
```

✅ Good:

```typescript
Effect.if(isValid, {
  onTrue: () => Effect.succeed('valid'),
  onFalse: () => Effect.fail('invalid'),
});

Effect.if(user.isAdmin, {
  onTrue: () => grantAccess(),
  onFalse: () => denyAccess(),
});
```

**Rationale**: `Match.value` is designed for pattern matching on discriminated unions and multiple values. Using it for simple boolean conditions is verbose and obscures intent. `Effect.if` is explicit, concise, and clearly communicates boolean branching logic.

### `prefer-match-over-ternary`

Encourages declarative `Match.value` patterns over ternary operators when pattern matching on non-boolean values or selecting between function calls.

**Note**: For boolean conditions returning Effects, use `Effect.if` instead (see `prefer-effect-if-over-match-boolean` rule above).

❌ Bad:

```typescript
const result = filter !== undefined ? Stream.filter(stream, filter) : stream;

const handler = (option: Option.Option<number>) =>
  Option.isSome(option) ? processValue(option.value) : getDefault();

const processStatus = (status: 'pending' | 'active' | 'complete') =>
  status === 'complete' ? finalizeTask() : continueTask();
```

✅ Good:

```typescript
const result = pipe(
  filter,
  Match.value,
  Match.when(Match.undefined, () => stream),
  Match.orElse((f) => Stream.filter(stream, f))
);

const handler = (option: Option.Option<number>) =>
  pipe(
    option,
    Match.value,
    Match.when(Match.some, (opt) => processValue(opt.value)),
    Match.orElse(getDefault)
  );

const processStatus = (status: 'pending' | 'active' | 'complete') =>
  pipe(status, Match.value, Match.when('complete', finalizeTask), Match.orElse(continueTask));
```

**For boolean conditions with Effects, use `Effect.if`:**

```typescript
// Boolean condition returning Effects - use Effect.if, NOT Match.value
const result = Effect.if(condition, {
  onTrue: () => Effect.succeed(42),
  onFalse: () => Effect.fail('error'),
});
```

**Rationale**: Ternary operators are imperative and less composable than `Match` patterns. Using `Match.value` provides better composability for pattern matching on values like optional types, union types, or non-boolean conditions. However, for simple boolean conditionals returning Effects, `Effect.if` is the preferred pattern as it's more explicit and type-safe. Plain value ternaries (not function calls) are allowed as they're appropriate for simple value selection.

### `no-switch-statement`

Forbids switch statements in functional Effect code. Switch statements are imperative and don't provide exhaustiveness checking. Use `Match` for type-safe, exhaustive pattern matching.

❌ Bad:

```typescript
switch (event.type) {
  case 'Created':
    return handleCreated(event);
  case 'Updated':
    return handleUpdated(event);
  default:
    return handleUnknown(event);
}
```

✅ Good:

```typescript
pipe(
  Match.value(event),
  Match.when({ type: 'Created' }, handleCreated),
  Match.when({ type: 'Updated' }, handleUpdated),
  Match.orElse(handleUnknown)
);
```

**For discriminated unions with `_tag`:**

```typescript
pipe(
  Match.value(either),
  Match.tag('Right', handleRight),
  Match.tag('Left', handleLeft),
  Match.exhaustive
);
```

### `no-if-statement`

Forbids if statements in functional Effect code. If statements are imperative and don't compose well. Use `Effect.if` for boolean conditionals with Effects, `Match.value` for pattern matching, or type-specific matchers for declarative control flow.

❌ Bad:

```typescript
if (state.deleted) {
  return Effect.fail(new Error('Cannot complete deleted TODO'));
}
return Effect.succeed(state);

if (event.type === 'TodoCreated') {
  return Effect.succeed({ title: event.data.title, completed: false });
}
return pipe(state, Option.match({ ... }));

if (Option.isSome(option)) {
  return option.value;
}
return defaultValue;
```

✅ Good:

```typescript
// Boolean conditionals with Effects
Effect.if(state.deleted, {
  onTrue: () => Effect.fail(new Error('Cannot complete deleted TODO')),
  onFalse: () => Effect.succeed(state),
})

// Pattern matching on discriminated unions
pipe(
  event,
  Match.value,
  Match.when({ type: 'TodoCreated' }, (e) => Effect.succeed({ title: e.data.title, completed: false })),
  Match.orElse((e) => pipe(state, Option.match({ ... })))
)

// Option/Either with built-in matchers
pipe(option, Option.getOrElse(() => defaultValue))

// Simple value selection - use ternary operators
const x = condition ? 'yes' : 'no';
```

**Rationale**: If statements break functional composition and make code harder to reason about. They don't provide exhaustiveness checking for pattern matching and can't be easily composed in pipes. Using `Effect.if`, `Match.value`, or type-specific matchers like `Option.match` provides better type safety, exhaustiveness checking, and composability. Ternary operators are still allowed for simple value selection as they're appropriate for plain values.

### `prefer-schema-validation-over-assertions`

Discourages type assertions in Effect callbacks in favor of runtime validation.

❌ Bad:

```typescript
Effect.map((x) => handler(x as MyType));
```

✅ Good:

```typescript
(Effect.flatMap(Schema.decodeUnknown(MyTypeSchema)), Effect.map(handler));
```

### `suggest-currying-opportunity`

Suggests currying user-defined functions to eliminate arrow function wrappers in pipe chains. By default, only suggests currying when parameters are already in the right order (no reordering needed) and limits to single-level currying for readability.

#### ✅ Will Suggest (good pattern - params already at end):

```typescript
// Before
Effect.catchAll(myEffect, (error) => logError('Failed', error));

// After currying (params already in right order)
const logError = (message: string) => (error: unknown) =>
  Effect.sync(() => console.error(message, error));

Effect.catchAll(myEffect, logError('Failed'));
```

#### ⚠️ Won't Suggest by Default (would require parameter reordering):

```typescript
// This would break semantic order - error should come before message
Effect.catchAll(myEffect, (error) => logError(error, 'Failed'));

// Would require changing to: logError = (message) => (error) => ...
// But semantically, error should come first in the return object
```

#### ⚠️ Won't Suggest by Default (would create deep currying):

```typescript
// Would create 2-level currying: (prefix) => (suffix) => (data) => ...
Effect.map(myEffect, (data) => processData('prefix', 'suffix', data));

// Too many parentheses at call site: processData('prefix')('suffix')
```

**Configuration Options:**

- `allowReordering` (default: `false`) - Allow suggestions even when parameters would need reordering
- `maxCurriedParams` (default: `1`, max: `3`) - Maximum number of curried parameters to suggest

```javascript
{
  rules: {
    'effect/suggest-currying-opportunity': ['warn', {
      allowReordering: true,    // Allow parameter reordering suggestions
      maxCurriedParams: 2,      // Allow up to 2-level currying
    }]
  }
}
```

**Note:** This rule only triggers on user-defined functions, not Effect library functions.

### `no-intermediate-effect-variables`

Forbids storing Effect/Stream/pipe results in intermediate variables **when they are only used once**. Variables that are genuinely reused multiple times are allowed as legitimate building blocks.

❌ Bad (single use - should inline):

```typescript
// Breaking up the pipe chain for a single use
const userEffect = fetchUser(userId);
const result = pipe(userEffect, Effect.flatMap(validateUser), Effect.map(formatUserData));

// Storing intermediate pipe results used once
const validated = pipe(data, Schema.decodeUnknown(UserSchema));
const processed = Effect.map(validated, processUser);
return Effect.flatMap(processed, saveToDatabase);

// Schema defined but only used once
const UserIdSchema = pipe(Schema.String, Schema.nonEmptyString());
export const decodeUserId = Schema.decode(UserIdSchema); // Only usage
```

✅ Good (inline single-use values):

```typescript
// Single cohesive pipe chain
const result = pipe(fetchUser(userId), Effect.flatMap(validateUser), Effect.map(formatUserData));

// All transformations in one composition
return pipe(
  data,
  Schema.decodeUnknown(UserSchema),
  Effect.map(processUser),
  Effect.flatMap(saveToDatabase)
);

// Schema inlined directly
export const decodeUserId = Schema.decode(pipe(Schema.String, Schema.nonEmptyString()));
```

✅ Good (multiple uses - legitimate reuse):

```typescript
// Layer reused in multiple compositions
const PgLive = Layer.effect(PgClient, createPgClient);
const Layer1 = pipe(Migration.layer, Layer.provide(PgLive)); // Use 1
const Layer2 = pipe(EventStore.layer, Layer.provide(PgLive)); // Use 2

// Effect reused across test cases
const setupTest = Effect.gen(/* ... */);
it('test 1', () => pipe(setupTest, Effect.flatMap(/* ... */))); // Use 1
it('test 2', () => pipe(setupTest, Effect.flatMap(/* ... */))); // Use 2
```

✅ Good (execution results are plain values):

```typescript
// runSync returns a plain value, not an Effect
const authResult = Effect.runSync(pipe(authenticate(req), Effect.either));
if (Either.isLeft(authResult)) {
  return Response.json({ error: authResult.left });
}
return Response.json({ token: authResult.right });
```

**Rationale**: Single-use intermediate variables break the flow of pipe composition and make code harder to follow. However, variables that are reused multiple times serve as legitimate building blocks for composition and should be kept. The rule also excludes execution methods (`runSync`, `runPromise`, `runFork`) which return plain values, and factory methods (`Schema.decode`) which return functions.

**Note:** This is an aggressive rule included in the `pipeStrict` config. It enforces proper functional composition patterns while allowing genuine code reuse.

## Rule Presets

### Recommended Presets

#### `recommended` ⭐

**Recommended for most projects** - Core Effect best practices without controversial rules:

- All Effect plugin rules
- Forbids classes (except Effect tags/errors)
- Forbids `Effect.runSync`/`runPromise` in production
- Enforces `Effect.andThen()` over `Effect.flatMap(() => )`
- Enforces `Effect.as()` over `Effect.map(() => value)`
- Forbids method-based `.pipe()` (use standalone `pipe()`)
- Forbids curried function calls (use `pipe` instead)
- Forbids identity functions in transformations
- Enforces proper pipe argument order

**Does NOT include:**

- `Effect.gen` ban (opt-in with `noGen`)
- `_tag` access ban (opt-in with `preferMatch`)
- Strict pipe rules (opt-in with `pipeStrict`)

#### `strict`

**For zealots** - Everything in `recommended` plus all opinionated rules:

- All `recommended` rules
- Forbids `Effect.gen` (use `pipe` instead)
- Forbids direct `_tag` access (use type guards or `Match`)
- Forbids ALL `switch` statements (use `Match.value` for pattern matching)
- Forbids ALL `if` statements (use `Effect.if`, `Match.value`, or type-specific matchers)
- Forbids nested `pipe()` calls
- Forbids multiple `pipe()` calls in one function

### Opt-in Configs

Mix these with `recommended` to customize your rules:

#### `noGen`

Forbids `Effect.gen` in favor of `pipe` composition. **Controversial** - some teams prefer gen!

#### `preferMatch`

Forbids direct `_tag` access, ALL `switch` statements, and ALL `if` statements. Encourages declarative `Match` patterns, `Effect.if` for boolean conditionals, and type-specific matchers.

#### `pipeStrict`

Enforces strict pipe composition rules:

- Forbids nested `pipe()` calls
- Forbids multiple `pipe()` calls per function
- Forbids storing pipe/Effect results in single-use intermediate variables

#### `plugin`

Plugin rules only, no syntax restrictions.

### Functional Immutability

#### `functionalImmutabilityRules`

Leverages `eslint-plugin-functional` with Effect-aware configuration:

- Enforces readonly types with Effect type exceptions
- Forbids `let` bindings
- Enforces immutable data patterns
- Forbids loops (use `Effect.forEach`, `Array.map`, etc.)

## Usage

### Recommended Setup

Start with `recommended` for sensible defaults:

```javascript
import effectPlugin from '@codeforbreakfast/eslint-effect';

export default [
  {
    ...effectPlugin.configs.recommended,
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      effect: effectPlugin,
    },
  },
];
```

### Add Opinionated Rules

Opt-in to stricter rules as needed:

```javascript
import effectPlugin from '@codeforbreakfast/eslint-effect';

export default [
  {
    ...effectPlugin.configs.recommended,
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      effect: effectPlugin,
    },
  },
  // Forbid Effect.gen
  {
    ...effectPlugin.configs.noGen,
    files: ['src/**/*.ts'],
  },
  // Enforce strict pipe rules
  {
    ...effectPlugin.configs.pipeStrict,
    files: ['src/**/*.ts'],
  },
  // Or just use strict for everything
  {
    ...effectPlugin.configs.strict,
    files: ['src/**/*.ts'],
    plugins: {
      effect: effectPlugin,
    },
  },
];
```

### With Functional Immutability

Requires `eslint-plugin-functional`:

```javascript
import functionalPlugin from 'eslint-plugin-functional';
import effectPlugin from '@codeforbreakfast/eslint-effect';

export default [
  {
    files: ['**/*.ts'],
    plugins: {
      functional: functionalPlugin,
    },
    rules: effectPlugin.configs.functionalImmutabilityRules,
  },
  {
    ...effectPlugin.configs.recommended,
    files: ['**/*.ts'],
    plugins: {
      effect: effectPlugin,
    },
  },
];
```

### Disabling Individual Rules

All syntax restriction rules are exposed as named ESLint rules, making it easy to disable specific rules:

```javascript
import effectPlugin from '@codeforbreakfast/eslint-effect';

export default [
  {
    ...effectPlugin.configs.recommended,
    files: ['scripts/**/*.ts'],
    plugins: {
      effect: effectPlugin,
    },
    rules: {
      // Allow runPromise/runSync in scripts (application entry points)
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
    },
  },
];
```

**Available named rules:**

- `effect/no-classes` - Forbid classes except Effect tags/errors
- `effect/no-runSync` - Forbid Effect.runSync
- `effect/no-runPromise` - Forbid Effect.runPromise
- `effect/prefer-andThen` - Use andThen over flatMap(() => ...)
- `effect/prefer-as` - Use as over map(() => value)
- `effect/no-gen` - Forbid Effect.gen (opt-in via `noGen` config)
- `effect/no-unnecessary-pipe-wrapper` - Detect unnecessary pipe wrappers
- `effect/no-eta-expansion` - Detect unnecessary function wrappers (prefer point-free style)
- `effect/no-unnecessary-function-alias` - Detect unnecessary function aliases
- `effect/prefer-match-tag` - Use Match.tag over Match.when for \_tag
- `effect/prefer-match-over-conditionals` - Use Match over if statements
- `effect/prefer-effect-if-over-match-boolean` - Use Effect.if over Match.value for boolean conditionals
- `effect/prefer-match-over-ternary` - Use Match.value over ternary operators for non-boolean pattern matching
- `effect/no-switch-statement` - Forbid ALL switch statements (use Match.value instead)
- `effect/no-if-statement` - Forbid ALL if statements (use Effect.if, Match.value, or type-specific matchers instead)
- `effect/prefer-schema-validation-over-assertions` - Use Schema over type assertions
- `effect/suggest-currying-opportunity` - Suggest currying to eliminate arrow function wrappers
- `effect/no-intermediate-effect-variables` - Forbid storing pipe/Effect results in single-use intermediate variables (opt-in via `pipeStrict` config)

## Available Exports

### Default Export (Recommended)

```typescript
import effectPlugin from '@codeforbreakfast/eslint-effect';

effectPlugin.rules; // All custom rules
effectPlugin.meta; // Plugin metadata

// Configs
effectPlugin.configs.recommended; // ⭐ Recommended for most projects
effectPlugin.configs.strict; // All rules including opinionated ones
effectPlugin.configs.noGen; // Opt-in: forbid Effect.gen
effectPlugin.configs.preferMatch; // Opt-in: forbid _tag access
effectPlugin.configs.pipeStrict; // Opt-in: strict pipe rules
effectPlugin.configs.plugin; // Plugin rules only
effectPlugin.configs.functionalImmutabilityRules; // Functional immutability rules object
```

Each config (except `functionalImmutabilityRules`) is a complete ESLint flat config object with:

- `name`: Config identifier
- `rules`: Rule configuration
- `plugins`: Required plugins (where applicable)

### Named Exports

```typescript
import {
  rules, // All custom rules (for plugin registration)
  functionalImmutabilityRules, // Functional immutability rules object
} from '@codeforbreakfast/eslint-effect';
```

### Scoped Imports

```javascript
import rules from '@codeforbreakfast/eslint-effect/rules';
```

## Philosophy

This package enforces a strict functional programming style with Effect:

1. **Composition over Generation**: Prefer `pipe` composition over `Effect.gen`
2. **Type Safety**: Use runtime validation (Schema) over type assertions
3. **Declarative Patterns**: Use `Match` over imperative conditionals
4. **Immutability**: Enforce readonly types and immutable data patterns
5. **Boundary Execution**: Run effects only at application boundaries

## License

MIT © CodeForBreakfast
