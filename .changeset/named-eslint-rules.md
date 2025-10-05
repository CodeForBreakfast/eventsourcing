---
'@codeforbreakfast/eslint-effect': minor
---

Expose syntax restrictions as named ESLint rules for easier configuration

Rules previously bundled in `no-restricted-syntax` are now available as individual named rules that can be easily enabled or disabled:

**New named rules:**

- `effect/no-classes` - Forbid classes except Effect tags/errors/schemas
- `effect/no-runSync` - Forbid Effect.runSync in production code
- `effect/no-runPromise` - Forbid Effect.runPromise in production code
- `effect/prefer-andThen` - Prefer Effect.andThen() over Effect.flatMap(() => ...)
- `effect/prefer-as` - Prefer Effect.as() over Effect.map(() => value)
- `effect/no-gen` - Forbid Effect.gen (used in `noGen` config)

**Before:**

```javascript
// Had to manipulate no-restricted-syntax arrays
rules: {
  'no-restricted-syntax': [
    'error',
    ...effectPlugin.configs.recommended.rules['no-restricted-syntax']
      .slice(1)
      .filter(restriction => ...)
  ]
}
```

**After:**

```javascript
// Simply disable by rule name
{
  ...effectPlugin.configs.recommended,
  rules: {
    'effect/no-runPromise': 'off',
    'effect/no-runSync': 'off',
  }
}
```

This makes it much easier to customize which rules are enabled for different file patterns (e.g., allowing `runPromise` in application entry points while forbidding it in library code).
