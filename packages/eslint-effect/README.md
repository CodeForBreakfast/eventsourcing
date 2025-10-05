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

## Configuration Presets

### Effect Syntax Restrictions

Enforces Effect best practices:

- Forbids `Effect.gen` (use `pipe` instead)
- Forbids classes (except Effect service tags and Data.TaggedError)
- Forbids `Effect.runSync`/`runPromise` in production code
- Forbids direct `_tag` access (use type guards or `Match`)
- Forbids `switch` on `_tag` (use `Match` functions)
- Enforces `Effect.andThen()` over `Effect.flatMap(() => )`
- Enforces `Effect.as()` over `Effect.map(() => value)`

### Simple Pipe Syntax Restrictions

Ensures consistent pipe usage:

- Forbids method-based `.pipe()` (use standalone `pipe()`)
- Forbids curried function calls (use `pipe` instead)
- Forbids nested `pipe()` calls
- Forbids multiple `pipe()` calls in one function
- Forbids identity functions in transformations
- Enforces proper pipe argument order

### Functional Immutability Rules

Leverages `eslint-plugin-functional` with Effect-aware configuration:

- Enforces readonly types with Effect type exceptions
- Forbids `let` bindings
- Enforces immutable data patterns
- Forbids loops (use `Effect.forEach`, `Array.map`, etc.)

## Usage

### Basic Setup

```javascript
import effectPlugin from '@codeforbreakfast/eslint-effect';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      effect: {
        rules: effectPlugin.rules,
      },
    },
    rules: {
      'effect/no-unnecessary-pipe-wrapper': 'error',
      'effect/prefer-match-tag': 'error',
      'effect/prefer-match-over-conditionals': 'error',
      'effect/prefer-schema-validation-over-assertions': 'error',
    },
  },
];
```

### Using Syntax Restrictions

```javascript
import {
  rules,
  effectSyntaxRestrictions,
  simplePipeSyntaxRestrictions,
} from '@codeforbreakfast/eslint-effect';

export default [
  {
    files: ['packages/**/*.ts'],
    plugins: {
      effect: { rules },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        ...effectSyntaxRestrictions,
        ...simplePipeSyntaxRestrictions,
      ],
      'effect/no-unnecessary-pipe-wrapper': 'error',
      'effect/prefer-match-tag': 'error',
      'effect/prefer-match-over-conditionals': 'error',
      'effect/prefer-schema-validation-over-assertions': 'error',
    },
  },
];
```

### Using with Functional Immutability

Requires `eslint-plugin-functional`:

```javascript
import functionalPlugin from 'eslint-plugin-functional';
import { rules, functionalImmutabilityRules } from '@codeforbreakfast/eslint-effect';

export default [
  {
    files: ['**/*.ts'],
    plugins: {
      effect: { rules },
      functional: functionalPlugin,
    },
    rules: {
      ...functionalImmutabilityRules,
      'effect/no-unnecessary-pipe-wrapper': 'error',
      'effect/prefer-match-tag': 'error',
    },
  },
];
```

## Available Exports

### Named Exports

```typescript
import {
  rules, // All custom rules
  effectSyntaxRestrictions, // Effect syntax restrictions array
  simplePipeSyntaxRestrictions, // Pipe syntax restrictions array
  functionalImmutabilityRules, // Immutability rules object
} from '@codeforbreakfast/eslint-effect';
```

### Default Export

```typescript
import effectPlugin from '@codeforbreakfast/eslint-effect';

effectPlugin.rules; // All custom rules
effectPlugin.configs.effectSyntaxRestrictions; // Effect syntax restrictions
effectPlugin.configs.simplePipeSyntaxRestrictions;
effectPlugin.configs.functionalImmutabilityRules;
```

### Scoped Imports

```javascript
import rules from '@codeforbreakfast/eslint-effect/rules';
import configs from '@codeforbreakfast/eslint-effect/configs';
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
