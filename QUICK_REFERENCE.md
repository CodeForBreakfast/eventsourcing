# Effect Simplification Quick Reference

## Top 10 Most Useful Patterns

### 1. `map(() => x)` → `as(x)`

```typescript
// ❌ Before
pipe(
  effect,
  Effect.map(() => 5)
);

// ✅ After
pipe(effect, Effect.as(5));
```

### 2. `map(() => void)` → `asVoid`

```typescript
// ❌ Before
pipe(
  effect,
  Effect.map(() => void 0)
);

// ✅ After
pipe(effect, Effect.asVoid);
```

### 3. `flatMap(identity)` → `flatten`

```typescript
// ❌ Before
pipe(
  nested,
  Effect.flatMap((x) => x)
);

// ✅ After
pipe(nested, Effect.flatten);
```

### 4. `value != null ? some(value) : none()` → `fromNullable(value)`

```typescript
// ❌ Before
const opt = value != null ? Option.some(value) : Option.none();

// ✅ After
const opt = Option.fromNullable(value);
```

### 5. `isSome(opt) ? opt.value : default` → `getOrElse(opt, () => default)`

```typescript
// ❌ Before
const result = Option.isSome(opt) ? opt.value : 'default';

// ✅ After
const result = pipe(
  opt,
  Option.getOrElse(() => 'default')
);
```

### 6. `flatMap(a => map(b, () => a))` → `zipLeft(a, b)`

```typescript
// ❌ Before
pipe(
  effect1,
  Effect.flatMap((value) =>
    pipe(
      effect2,
      Effect.map(() => value)
    )
  )
);

// ✅ After
pipe(effect1, Effect.zipLeft(effect2));
```

### 7. `succeed(Option.some(x))` → `succeedSome(x)`

```typescript
// ❌ Before
Effect.succeed(Option.some(42));

// ✅ After
Effect.succeedSome(42);
```

### 8. `succeed(Option.none())` → `succeedNone`

```typescript
// ❌ Before
Effect.succeed(Option.none());

// ✅ After
Effect.succeedNone;
```

### 9. `flatMap(v => map(sideEffect, () => v))` → `tap(sideEffect)`

```typescript
// ❌ Before
pipe(
  effect,
  Effect.flatMap((value) =>
    pipe(
      Console.log(value),
      Effect.map(() => value)
    )
  )
);

// ✅ After
pipe(
  effect,
  Effect.tap((value) => Console.log(value))
);
```

### 10. `filter(Option.isSome).map(x => x.value)` → `getSomes`

```typescript
// ❌ Before
pipe(
  array,
  Array.filter(Option.isSome),
  Array.map((x) => x.value)
);

// ✅ After
pipe(array, Array.getSomes);
```

## By Use Case

### Working with constant values

- `map(() => x)` → `as(x)`
- `map(() => void)` → `asVoid`

### Working with Options

- `map(Option.some)` → `asSome`
- `value != null ? some(value) : none()` → `fromNullable(value)`
- `isSome ? value : default` → `getOrElse(() => default)`
- `getOrElse(() => null)` → `getOrNull`

### Flattening nested structures

- `flatMap(identity)` → `flatten`
- `flatMap((x) => x)` → `flatten`

### Combining effects

- `flatMap(a => map(b, () => a))` → `zipLeft(a, b)`
- `flatMap(() => b)` → `zipRight(a, b)` or `andThen(b)`
- `flatMap(v => map(fx, () => v))` → `tap(fx)`

### Creating effects with Options

- `succeed(Option.some(x))` → `succeedSome(x)`
- `succeed(Option.none())` → `succeedNone`

### Working with arrays

- `get(0)` → `head`
- `filter(Option.isSome) + map` → `getSomes`
- `filter(Either.isRight) + map` → `getRights`
- `filter(Either.isLeft) + map` → `getLefts`

### Conditional execution

- `condition ? effect : void` → `when(effect, () => condition)`
- `!condition ? effect : void` → `unless(effect, () => condition)`

### Error handling

- Complex ignore → `ignore`
- Ignore with logging → `ignoreLogged`
- Error side effects → `tapError`
- Both channels → `tapBoth`

## Function Signatures

```typescript
// Effect.as
const as: {
  <B>(value: B): <A, E, R>(self: Effect<A, E, R>) => Effect<B, E, R>;
  <A, E, R, B>(self: Effect<A, E, R>, value: B): Effect<B, E, R>;
};

// Effect.asVoid
const asVoid: <A, E, R>(self: Effect<A, E, R>) => Effect<void, E, R>;

// Effect.flatten
const flatten: <A, E1, R1, E, R>(
  self: Effect<Effect<A, E1, R1>, E, R>
) => Effect<A, E | E1, R | R1>;

// Option.fromNullable
const fromNullable: <A>(value: A) => Option<NonNullable<A>>;

// Option.getOrElse
const getOrElse: {
  <B>(onNone: LazyArg<B>): <A>(self: Option<A>) => A | B;
  <A, B>(self: Option<A>, onNone: LazyArg<B>): A | B;
};

// Effect.zipLeft
const zipLeft: {
  <A2, E2, R2>(
    that: Effect<A2, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>;
  <A, E, R, A2, E2, R2>(self: Effect<A, E, R>, that: Effect<A2, E2, R2>): Effect<A, E | E2, R | R2>;
};

// Effect.tap
const tap: {
  <A, X>(f: (a: A) => X): <E, R>(self: Effect<A, E, R>) => Effect<A, E, R>;
  <A, E, R, X>(self: Effect<A, E, R>, f: (a: A) => X): Effect<A, E, R>;
};
```

## Remember

1. These patterns improve readability by making intent clearer
2. Most have auto-fix capabilities in ESLint
3. They work across Effect data types (Effect, Stream, STM, etc.)
4. Pipe-based style is preferred in longer chains
5. Always check the types - the compiler is your friend!
