# Effect Simplification Patterns

This document catalogs Effect functions that simplify more complex patterns. These patterns should be suggested via eslint rules to help developers write more idiomatic Effect code.

## Core Effect Patterns

### 1. `Effect.as(value)` replaces `Effect.map(() => value)`

**Pattern:** Replacing the result of an effect with a constant value

**Instead of:**

```typescript
Effect.map(effect, () => someValue);
Effect.map(() => someValue);
pipe(
  effect,
  Effect.map(() => someValue)
);
```

**Use:**

```typescript
Effect.as(effect, someValue);
Effect.as(someValue);
pipe(effect, Effect.as(someValue));
```

**Also applies to:**

- `Option.as(value)`
- `Stream.as(value)`
- `Schedule.as(value)`
- `Channel.as(value)`
- `STM.as(value)`
- `Sink.as(value)`
- `Cause.as(value)`

---

### 2. `Effect.asVoid` replaces `Effect.map(() => void)` or `Effect.map(() => undefined)`

**Pattern:** Discarding the result of an effect

**Instead of:**

```typescript
Effect.map(effect, () => void 0);
Effect.map(effect, () => undefined);
Effect.map(effect, () => {});
Effect.map(() => void 0);
pipe(
  effect,
  Effect.map(() => undefined)
);
```

**Use:**

```typescript
Effect.asVoid(effect);
pipe(effect, Effect.asVoid);
```

**Also applies to:**

- `Option.asVoid`

---

### 3. `Effect.asSome` replaces `Effect.map(Option.some)`

**Pattern:** Wrapping an effect's success value in Option.some

**Instead of:**

```typescript
Effect.map(effect, Option.some);
Effect.map(Option.some);
pipe(effect, Effect.map(Option.some));
pipe(
  effect,
  Effect.map((x) => Option.some(x))
);
```

**Use:**

```typescript
Effect.asSome(effect);
pipe(effect, Effect.asSome);
```

---

### 4. `Effect.asSomeError` replaces `Effect.mapError(Option.some)`

**Pattern:** Wrapping an effect's error value in Option.some

**Instead of:**

```typescript
Effect.mapError(effect, Option.some);
pipe(effect, Effect.mapError(Option.some));
pipe(
  effect,
  Effect.mapError((e) => Option.some(e))
);
```

**Use:**

```typescript
Effect.asSomeError(effect);
pipe(effect, Effect.asSomeError);
```

---

### 5. `Effect.flatten` replaces `Effect.flatMap(identity)`

**Pattern:** Flattening nested effects

**Instead of:**

```typescript
Effect.flatMap(effect, identity);
Effect.flatMap((x) => x);
Effect.flatMap(identity);
pipe(effect, Effect.flatMap(identity));
pipe(
  effect,
  Effect.flatMap((x) => x)
);
```

**Use:**

```typescript
Effect.flatten(effect);
pipe(effect, Effect.flatten);
```

**Also applies to:**

- `Option.flatten` (replaces `Option.flatMap(identity)`)
- `Array.flatten` (replaces `Array.flatMap(identity)`)
- `Cause.flatten`
- `STM.flatten`

---

### 6. `Effect.zipLeft` replaces `Effect.flatMap(a => Effect.map(b, () => a))`

**Pattern:** Running two effects sequentially, keeping only the first result

**Instead of:**

```typescript
Effect.flatMap(effect1, (a) => Effect.map(effect2, () => a));
Effect.flatMap(effect1, (a) => Effect.as(effect2, a));
pipe(
  effect1,
  Effect.flatMap((a) =>
    pipe(
      effect2,
      Effect.map(() => a)
    )
  )
);
```

**Use:**

```typescript
Effect.zipLeft(effect1, effect2);
pipe(effect1, Effect.zipLeft(effect2));
```

**Also applies to:**

- `Option.zipLeft`

---

### 7. `Effect.zipRight` replaces `Effect.flatMap(a => b)` where `a` result is unused

**Pattern:** Running two effects sequentially, keeping only the second result

**Instead of:**

```typescript
Effect.flatMap(effect1, () => effect2);
Effect.flatMap(effect1, (_) => effect2);
pipe(
  effect1,
  Effect.flatMap(() => effect2)
);
pipe(effect1, Effect.andThen(effect2));
```

**Use:**

```typescript
Effect.zipRight(effect1, effect2);
pipe(effect1, Effect.zipRight(effect2));
```

**Note:** `andThen` is also acceptable, but `zipRight` makes the intent clearer when you explicitly want both effects to run.

**Also applies to:**

- `Option.zipRight`

---

### 8. `Effect.ignore` replaces `Effect.map(() => void)` + error handling

**Pattern:** Ignoring both success and failure results

**Instead of:**

```typescript
pipe(
  effect,
  Effect.matchEffect({
    onFailure: () => Effect.void,
    onSuccess: () => Effect.void,
  })
);
```

**Use:**

```typescript
Effect.ignore(effect);
pipe(effect, Effect.ignore);
```

---

### 9. `Effect.ignoreLogged` replaces `Effect.ignore` with logging

**Pattern:** Ignoring result but logging failures

**Instead of:**

```typescript
pipe(
  effect,
  Effect.matchEffect({
    onFailure: (e) => Effect.logError(e).pipe(Effect.asVoid),
    onSuccess: () => Effect.void,
  })
);
```

**Use:**

```typescript
Effect.ignoreLogged(effect);
pipe(effect, Effect.ignoreLogged);
```

---

## Option Patterns

### 10. `Option.fromNullable` replaces conditional logic

**Pattern:** Converting nullable values to Option

**Instead of:**

```typescript
value != null ? Option.some(value) : Option.none();
value !== null && value !== undefined ? Option.some(value) : Option.none();
```

**Use:**

```typescript
Option.fromNullable(value);
```

---

### 11. `Option.getOrElse` replaces conditional unwrapping

**Pattern:** Getting value or default

**Instead of:**

```typescript
Option.isSome(opt) ? opt.value : defaultValue;
Option.match(opt, {
  onNone: () => defaultValue,
  onSome: (x) => x,
});
```

**Use:**

```typescript
Option.getOrElse(opt, () => defaultValue);
pipe(
  opt,
  Option.getOrElse(() => defaultValue)
);
```

---

### 12. `Option.getOrNull` and `Option.getOrUndefined`

**Pattern:** Converting Option back to nullable

**Instead of:**

```typescript
Option.getOrElse(opt, () => null);
Option.getOrElse(opt, () => undefined);
pipe(
  opt,
  Option.getOrElse(() => null)
);
```

**Use:**

```typescript
Option.getOrNull(opt);
Option.getOrUndefined(opt);
```

---

## Array Patterns

### 13. `Array.head` replaces `Array.get(0)`

**Pattern:** Getting first element

**Instead of:**

```typescript
Array.get(arr, 0);
pipe(arr, Array.get(0));
```

**Use:**

```typescript
Array.head(arr);
pipe(arr, Array.head);
```

---

### 14. `Array.getSomes` replaces `Array.filterMap(identity)` for Options

**Pattern:** Filtering and extracting Some values

**Instead of:**

```typescript
Array.filterMap(arr, identity);
pipe(arr, Array.filterMap(identity));
Array.filterMap(arr, (x) => x);
pipe(
  arr,
  Array.filter(Option.isSome),
  Array.map((x) => x.value)
);
```

**Use:**

```typescript
Array.getSomes(arr);
pipe(arr, Array.getSomes);
```

---

### 15. `Array.getRights` and `Array.getLefts`

**Pattern:** Filtering and extracting Either values

**Instead of:**

```typescript
pipe(
  arr,
  Array.filter(Either.isRight),
  Array.map((x) => x.right)
);
pipe(
  arr,
  Array.filter(Either.isLeft),
  Array.map((x) => x.left)
);
```

**Use:**

```typescript
Array.getRights(arr);
Array.getLefts(arr);
```

---

## Effect Success/Failure Constructors

### 16. `Effect.succeedNone` replaces `Effect.succeed(Option.none())`

**Pattern:** Creating an effect that succeeds with None

**Instead of:**

```typescript
Effect.succeed(Option.none());
```

**Use:**

```typescript
Effect.succeedNone;
```

---

### 17. `Effect.succeedSome` replaces `Effect.succeed(Option.some(value))`

**Pattern:** Creating an effect that succeeds with Some

**Instead of:**

```typescript
Effect.succeed(Option.some(value));
pipe(value, Option.some, Effect.succeed);
```

**Use:**

```typescript
Effect.succeedSome(value);
```

---

## Conditional Effects

### 18. `Effect.when` replaces conditional effect execution

**Pattern:** Conditionally running an effect

**Instead of:**

```typescript
condition ? effect : Effect.void;
condition ? effect : Effect.unit;
if (condition) {
  yield * effect;
}
```

**Use:**

```typescript
Effect.when(effect, () => condition);
Effect.when(() => condition)(effect);
```

---

### 19. `Effect.unless` replaces negated conditional

**Pattern:** Conditionally running an effect when false

**Instead of:**

```typescript
!condition ? effect : Effect.void;
condition ? Effect.void : effect;
if (!condition) {
  yield * effect;
}
```

**Use:**

```typescript
Effect.unless(effect, () => condition);
Effect.unless(() => condition)(effect);
```

---

## Match Patterns

### 20. `Match.value` over nested ternaries

**Pattern:** Pattern matching on values

**Instead of:**

```typescript
value === 'a' ? result1 : value === 'b' ? result2 : value === 'c' ? result3 : defaultResult;
```

**Use:**

```typescript
pipe(
  Match.value(value),
  Match.when('a', () => result1),
  Match.when('b', () => result2),
  Match.when('c', () => result3),
  Match.orElse(() => defaultResult)
);
```

---

### 21. `Match.tags` for discriminated unions

**Pattern:** Handling discriminated unions

**Instead of:**

```typescript
switch (value._tag) {
  case 'A':
    return handleA(value);
  case 'B':
    return handleB(value);
  case 'C':
    return handleC(value);
}
```

**Use:**

```typescript
pipe(
  Match.value(value),
  Match.tags({
    A: handleA,
    B: handleB,
    C: handleC,
  }),
  Match.exhaustive
);
```

---

## Effect Composition

### 22. `Effect.andThen` over `Effect.flatMap` for simple sequencing

**Pattern:** Sequencing effects where previous value isn't needed

**Instead of:**

```typescript
Effect.flatMap(effect1, () => effect2);
Effect.flatMap(() => effect2);
pipe(
  effect1,
  Effect.flatMap(() => effect2)
);
```

**Use:**

```typescript
Effect.andThen(effect1, effect2);
pipe(effect1, Effect.andThen(effect2));
```

---

### 23. `Effect.tap` over `Effect.flatMap` for side effects

**Pattern:** Running side effects while preserving the value

**Instead of:**

```typescript
Effect.flatMap(effect, (value) => Effect.map(sideEffect, () => value));
pipe(
  effect,
  Effect.flatMap((value) =>
    pipe(
      sideEffect,
      Effect.map(() => value)
    )
  )
);
```

**Use:**

```typescript
Effect.tap(effect, (value) => sideEffect);
pipe(
  effect,
  Effect.tap((value) => sideEffect)
);
```

---

### 24. `Effect.tapError` for error-side effects

**Pattern:** Running side effects on errors while preserving the error

**Instead of:**

```typescript
Effect.catchAll(effect, (error) => Effect.flatMap(sideEffect, () => Effect.fail(error)));
```

**Use:**

```typescript
Effect.tapError(effect, (error) => sideEffect);
pipe(
  effect,
  Effect.tapError((error) => sideEffect)
);
```

---

### 25. `Effect.tapBoth` for side effects on both channels

**Pattern:** Running side effects on both success and failure

**Instead of:**

```typescript
pipe(
  effect,
  Effect.tap((value) => onSuccessEffect),
  Effect.tapError((error) => onErrorEffect)
);
```

**Use:**

```typescript
Effect.tapBoth(effect, {
  onSuccess: (value) => onSuccessEffect,
  onFailure: (error) => onErrorEffect,
});
pipe(
  effect,
  Effect.tapBoth({
    onSuccess: (value) => onSuccessEffect,
    onFailure: (error) => onErrorEffect,
  })
);
```

---

## Notes

- All these patterns are consistent across similar data types in Effect (Effect, Option, Either, Stream, STM, etc.)
- The pipe-based versions are often more readable in longer pipelines
- These suggestions should be auto-fixable where possible
- Priority should be given to patterns that:
  1. Are most commonly used
  2. Have the clearest improvement in readability
  3. Are least likely to have false positives

## Implementation Strategy

Each pattern should become an ESLint rule that:

1. Detects the verbose pattern
2. Suggests the simpler alternative
3. Provides an auto-fix when safe
4. Includes clear documentation and examples
5. Handles both data-first and data-last (piped) call styles
