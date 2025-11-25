# @codeforbreakfast/bun-test-effect

Testing utilities for Effect with Bun, providing effect-native test runners and assertions. Adapted from [@effect/vitest](https://github.com/Effect-TS/effect/tree/main/packages/vitest).

## Installation

```bash
bun add --dev @codeforbreakfast/bun-test-effect
```

## Features

This package provides:

- **Effect-aware test runners** that handle Effect execution automatically
- **Scoped test runners** for tests requiring resource management
- **Layer sharing** across multiple tests with automatic setup/teardown
- **Effect-native assertions** for Option, Either, and equality checks
- **ESLint rules** to enforce best practices in Effect tests

## Basic Usage

### Effect Test Runners

Use `it.effect` or `it.scoped` instead of plain `test` to run Effects in your tests:

```typescript
import { describe, it, expect } from '@codeforbreakfast/bun-test-effect';
import { Effect } from 'effect';

describe('MyService', () => {
  it.effect('should process data', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(42);
      expect(result).toBe(42);
    })
  );

  it.scoped('should handle resources', () =>
    Effect.gen(function* () {
      const resource = yield* Effect.acquireRelease(Effect.succeed('resource'), () => Effect.void);
      expect(resource).toBe('resource');
    })
  );
});
```

### Test Variants

All test runners support standard Bun test modifiers:

```typescript
it.effect.skip('skipped test', () => Effect.void);
it.effect.only('focused test', () => Effect.void);
it.effect.skipIf(condition)('conditional skip', () => Effect.void);
it.effect.runIf(condition)('conditional run', () => Effect.void);
it.effect.fails('expected to fail', () => Effect.fail('error'));
it.effect.each([1, 2, 3])('parameterized test', (n) => Effect.succeed(n));
```

### Live vs Test Environment

- `it.effect` / `it.scoped` - Runs with `TestServices` (test clock, etc.)
- `it.live` / `it.scopedLive` - Runs with real services (real clock, etc.)

```typescript
it.live('uses real time', () =>
  Effect.gen(function* () {
    yield* Effect.sleep('100 millis'); // Actually waits 100ms
  })
);
```

### Sharing Layers

Use `it.layer` to share a Layer across multiple tests with automatic lifecycle management:

```typescript
import { describe, it } from '@codeforbreakfast/bun-test-effect';
import { Effect, Layer, Context } from 'effect';

class Database extends Context.Tag('Database')<
  Database,
  { query: (sql: string) => Effect.Effect<unknown> }
>() {}

const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.succeed({ rows: [] }),
});

describe('Database tests', () => {
  it.layer(DatabaseLive)((it) => {
    it.effect('should query', () =>
      Effect.gen(function* () {
        const db = yield* Database;
        const result = yield* db.query('SELECT 1');
        // ...
      })
    );

    it.effect('should insert', () =>
      Effect.gen(function* () {
        const db = yield* Database;
        // Layer is shared, setup runs once
      })
    );
  });
});
```

## Effect-Native Assertions

For testing within Effect pipelines, use the provided assertion utilities:

```typescript
import {
  expectSome,
  expectNone,
  expectRight,
  expectLeft,
  assertEqual,
  expectTrue,
  expectFalse,
} from '@codeforbreakfast/bun-test-effect';
import { Effect, Option, Either, pipe } from 'effect';

it.effect('assertion examples', () =>
  Effect.gen(function* () {
    // Option assertions
    yield* expectSome(Option.some(42));
    yield* expectNone(Option.none());

    // Either assertions
    yield* expectRight(Either.right('success'));
    yield* expectLeft(Either.left('error'));

    // Equality (uses Effect's Equal)
    yield* pipe(42, assertEqual(42));

    // Boolean assertions with custom messages
    yield* pipe(true, expectTrue('should be true'));
    yield* pipe(false, expectFalse('should be false'));
  })
);
```

## Utilities

### Silent Logger

Suppress log output during tests:

```typescript
import { silentLogger } from '@codeforbreakfast/bun-test-effect';
import { Effect, pipe } from 'effect';

it.effect('quiet test', () =>
  pipe(
    Effect.gen(function* () {
      yield* Effect.log("This won't appear in test output");
    }),
    Effect.provide(silentLogger)
  )
);
```

### Flaky Test Retry

Retry flaky tests with exponential backoff:

```typescript
import { it, flakyTest } from '@codeforbreakfast/bun-test-effect';
import { Effect } from 'effect';

it.effect('eventually succeeds', () =>
  flakyTest(
    Effect.gen(function* () {
      // Test that may fail intermittently
    }),
    '30 seconds' // timeout
  )
);
```

## ESLint Rules

This package includes ESLint rules to enforce best practices in Effect tests:

```javascript
// eslint.config.mjs
import buntestPlugin from '@codeforbreakfast/bun-test-effect/eslint';

export default [
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    plugins: {
      'bun-test-effect': buntestPlugin,
    },
    rules: {
      'bun-test-effect/no-runPromise-in-tests': 'error',
      'bun-test-effect/no-runSync-in-tests': 'error',
      'bun-test-effect/prefer-effect-assertions': 'warn',
    },
  },
];
```

### Available Rules

| Rule                       | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `no-runPromise-in-tests`   | Forbids `Effect.runPromise` in tests - use `it.effect` instead |
| `no-runSync-in-tests`      | Forbids `Effect.runSync` in tests - use `it.effect` instead    |
| `prefer-effect-assertions` | Suggests using Effect-native assertions over manual matching   |

## API Reference

### Test Runners

| Export                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `it.effect`                  | Run Effect tests with TestServices         |
| `it.scoped`                  | Run scoped Effect tests with TestServices  |
| `it.live`                    | Run Effect tests with real services        |
| `it.scopedLive`              | Run scoped Effect tests with real services |
| `it.layer(layer)`            | Share a Layer across multiple tests        |
| `flakyTest(effect, timeout)` | Retry flaky tests                          |

### Assertions

| Export                  | Description                          |
| ----------------------- | ------------------------------------ |
| `expectSome(option)`    | Assert Option is Some, return value  |
| `expectNone(option)`    | Assert Option is None                |
| `expectRight(either)`   | Assert Either is Right, return value |
| `expectLeft(either)`    | Assert Either is Left, return value  |
| `assertEqual(expected)` | Assert equality using Effect's Equal |
| `expectTrue(message)`   | Assert boolean is true               |
| `expectFalse(message)`  | Assert boolean is false              |

### Utilities

| Export                 | Description                                |
| ---------------------- | ------------------------------------------ |
| `silentLogger`         | Logger that discards all output            |
| `addEqualityTesters()` | Register Effect equality matchers with Bun |

### Re-exports

All exports from `bun:test` are re-exported for convenience:

```typescript
import { describe, test, expect, beforeAll, afterAll } from '@codeforbreakfast/bun-test-effect';
```

## License

MIT
