---
'@codeforbreakfast/eslint-effect': patch
'@codeforbreakfast/buntest': patch
'@codeforbreakfast/eventsourcing-store': patch
---

Improve nested pipe detection and add test enforcement rules

**Breaking behavior change in `no-nested-pipes` rule (formerly `no-multiple-pipes`):**

The rule now only flags truly nested pipe calls (where one pipe is used as an argument to another pipe), instead of flagging any function with multiple sequential pipe calls.

**Before:**

```typescript
// This was incorrectly flagged as an error
const result1 = pipe(42, (x) => x + 1);
const result2 = pipe(result1, (x) => x * 2); // ❌ Error
```

**After:**

```typescript
// Multiple sequential pipes are now allowed
const result1 = pipe(42, (x) => x + 1);
const result2 = pipe(result1, (x) => x * 2); // ✅ OK

// Only nested pipes are flagged
const bad = pipe(
  pipe(42, (x) => x + 1), // ❌ Error - nested pipe
  (x) => x * 2
);
```

**New buntest rules:**

- `buntest/no-runPromise-in-tests` - Enforces using `it.effect()` instead of `Effect.runPromise()` in test files for better error handling and test isolation

**Migration guide:**

If you were relying on the old `no-multiple-pipes` behavior, you'll need to update your ESLint config to use the new rule name `no-nested-pipes`. The rule is less strict now and only catches genuinely problematic nested pipe patterns.
