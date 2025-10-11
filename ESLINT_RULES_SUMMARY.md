# ESLint Rules for Effect Simplification Patterns

## Quick Reference Table

| Rule ID                | Pattern                          | Replacement                 | Priority | Auto-fix |
| ---------------------- | -------------------------------- | --------------------------- | -------- | -------- |
| `prefer-as`            | `map(() => value)`               | `as(value)`                 | High     | Yes      |
| `prefer-as-void`       | `map(() => void)`                | `asVoid`                    | High     | Yes      |
| `prefer-as-some`       | `map(Option.some)`               | `asSome`                    | Medium   | Yes      |
| `prefer-as-some-error` | `mapError(Option.some)`          | `asSomeError`               | Low      | Yes      |
| `prefer-flatten`       | `flatMap(identity)`              | `flatten`                   | High     | Yes      |
| `prefer-zip-left`      | `flatMap(a => map(b, () => a))`  | `zipLeft(a, b)`             | Medium   | Yes      |
| `prefer-zip-right`     | `flatMap(() => b)`               | `zipRight(a, b)`            | Medium   | Maybe    |
| `prefer-ignore`        | Complex ignore pattern           | `ignore`                    | Low      | Maybe    |
| `prefer-ignore-logged` | Ignore with logging              | `ignoreLogged`              | Low      | No       |
| `prefer-from-nullable` | Ternary null check               | `fromNullable`              | High     | Yes      |
| `prefer-get-or-else`   | `isSome ? value : default`       | `getOrElse`                 | High     | Yes      |
| `prefer-get-or-null`   | `getOrElse(() => null)`          | `getOrNull`                 | Medium   | Yes      |
| `prefer-head`          | `get(0)`                         | `head`                      | Medium   | Yes      |
| `prefer-get-somes`     | Filter + map for Options         | `getSomes`                  | Medium   | Yes      |
| `prefer-get-rights`    | Filter + map for Eithers         | `getRights`                 | Medium   | Yes      |
| `prefer-succeed-none`  | `succeed(Option.none())`         | `succeedNone`               | High     | Yes      |
| `prefer-succeed-some`  | `succeed(Option.some(x))`        | `succeedSome(x)`            | High     | Yes      |
| `prefer-when`          | `condition ? effect : void`      | `when(effect, condition)`   | Medium   | Maybe    |
| `prefer-unless`        | `!condition ? effect : void`     | `unless(effect, condition)` | Medium   | Maybe    |
| `prefer-match-value`   | Nested ternaries                 | `Match.value`               | Low      | No       |
| `prefer-match-tags`    | Switch on `_tag`                 | `Match.tags`                | Medium   | No       |
| `prefer-and-then`      | Simple `flatMap(() => x)`        | `andThen(x)`                | Low      | Yes      |
| `prefer-tap`           | `flatMap(v => map(fx, () => v))` | `tap(fx)`                   | Medium   | Yes      |
| `prefer-tap-error`     | Error-side tap pattern           | `tapError`                  | Medium   | Yes      |
| `prefer-tap-both`      | `tap` + `tapError`               | `tapBoth`                   | Low      | Maybe    |

## Rule Categories

### Category 1: High Priority (Most Common, Clearest Improvement)

These should be implemented first as they provide the most value:

1. **prefer-as** - Extremely common pattern
2. **prefer-as-void** - Very common when discarding results
3. **prefer-flatten** - Common in nested effect scenarios
4. **prefer-from-nullable** - Common when working with JS APIs
5. **prefer-get-or-else** - Common Option unwrapping
6. **prefer-succeed-none/some** - Common when creating Option-based effects

### Category 2: Medium Priority (Good Improvements, Less Common)

These provide good value but are less frequently encountered:

1. **prefer-zip-left/right** - Useful but less common
2. **prefer-as-some/error** - Specific Option/error scenarios
3. **prefer-get-or-null** - Specific unwrapping case
4. **prefer-head** - Common array operation
5. **prefer-get-somes/rights** - Common when filtering collections
6. **prefer-when/unless** - Conditional effect execution
7. **prefer-tap/error** - Side effect patterns
8. **prefer-match-tags** - Discriminated union handling

### Category 3: Low Priority (Advanced or Rare)

These are useful but less critical:

1. **prefer-ignore/logged** - Specific error handling
2. **prefer-match-value** - Complex branching logic
3. **prefer-and-then** - Subtle difference from flatMap
4. **prefer-tap-both** - Combining multiple taps

## Affected Data Types

Each rule may apply to multiple Effect data types:

### Rules applying to multiple types:

- `prefer-as`: Effect, Option, Stream, Schedule, Channel, STM, Sink, Cause
- `prefer-as-void`: Effect, Option
- `prefer-flatten`: Effect, Option, Array, Cause, STM
- `prefer-zip-left/right`: Effect, Option

### Type-specific rules:

- Effect-only: `prefer-ignore`, `prefer-when`, `prefer-tap`, etc.
- Option-only: `prefer-from-nullable`, `prefer-get-or-else`, etc.
- Array-only: `prefer-head`, `prefer-get-somes`, etc.

## Implementation Considerations

### AST Patterns to Match

#### 1. `prefer-as`

```typescript
// Pattern: CallExpression with map and arrow function returning constant
// Match: Effect.map(effect, () => value)
// Also: pipe(effect, Effect.map(() => value))
```

#### 2. `prefer-flatten`

```typescript
// Pattern: CallExpression with flatMap and identity function
// Match: Effect.flatMap(effect, identity)
// Also: Effect.flatMap(effect, (x) => x)
```

#### 3. `prefer-from-nullable`

```typescript
// Pattern: ConditionalExpression with null/undefined check
// Match: value != null ? Option.some(value) : Option.none()
```

### Edge Cases to Handle

1. **Type ambiguity**: Some patterns work for multiple types (Effect, Stream, etc.)
2. **Pipe vs direct calls**: Rules must handle both styles
3. **Data-first vs data-last**: Effect uses dual APIs
4. **Complex expressions**: Nested or chained calls
5. **Type inference**: Ensuring replacements maintain type safety

### Auto-fix Safety

Auto-fixes should only be applied when:

1. The pattern is unambiguous
2. Type information is available (when needed)
3. No side effects would be altered
4. The replacement is semantically identical

### Testing Strategy

Each rule should have tests for:

1. Basic pattern matching (both styles)
2. Edge cases (nested, chained, etc.)
3. False positives (similar but different patterns)
4. Auto-fix correctness
5. Type safety preservation

## Example Rule Structure

```typescript
{
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Effect.as over Effect.map with constant return',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    return {
      // Rule implementation
      // - Detect pattern
      // - Report issue
      // - Provide fix
    };
  },
}
```

## Configuration Recommendations

### Default Config (Strict)

Enable all High Priority rules with auto-fix

### Recommended Config

Enable High + Medium Priority rules

### Loose Config

Enable only High Priority rules without auto-fix for some

## Future Extensions

### Possible Additional Patterns

1. **Monadic Laws**: Detect violations of functor/monad laws
2. **Performance**: Detect inefficient patterns (unnecessary allocations, etc.)
3. **Best Practices**: Prefer `gen` over manual flatMap chains
4. **Error Handling**: Suggest better error handling patterns

### Integration with Effect LSP

These patterns could also be integrated with the Effect Language Server for real-time suggestions in IDEs.
