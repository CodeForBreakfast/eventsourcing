---
'@codeforbreakfast/eventsourcing-protocol': patch
---

Refactor test helper functions to use proper Effect-based error handling

This change improves the internal test utilities in the protocol package by replacing imperative code patterns with functional Effect-based implementations using Match.tag for discriminated union handling.

**What changed:**

- Refactored `verifySuccessResult` to return `Effect.Effect<void, Error>` instead of using side effects
- Refactored `verifyFailureResult` to return `Effect.Effect<void, Error>` with proper error channel usage
- Replaced direct type guard usage with `Match.tag` for discriminated union matching on CommandResult
- Updated `sendCommandWithVerification` to use `Effect.flatMap` to handle Effect-returning verify functions
- Extracted helper functions like `matchParsedError`, `parseErrorMessage`, and `matchFailureError` to avoid nested pipes

**Why this matters:**

These are internal test utilities, but the refactoring demonstrates proper Effect patterns:

- Errors flow through Effect's error channel using `Effect.fail` instead of throwing exceptions
- Uses `Match.tag` for discriminated unions rather than imperative if statements with type guards
- All verification logic is now pure functional composition
- Better alignment with Effect's functional programming idioms

**No API changes:**

This is purely an internal refactoring of test helpers. There are no changes to the public API or behavior of the eventsourcing-protocol package.
