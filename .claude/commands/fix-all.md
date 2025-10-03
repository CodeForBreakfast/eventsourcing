---
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(cd:*), Bash(pwd:*), Bash(turbo:*)
description: Iteratively fix all issues shown by `turbo all` one file at a time until the build passes completely.
---

# Your Task

Iteratively fix all issues shown by `turbo all` one file at a time until the build passes completely.

## Instructions

You are orchestrating a complex multi-file fix operation. Your job is to:

1. **Run `turbo all`** to identify the first failing file
2. **Delegate to the effect-pro agent** to fix that specific file
3. **Commit the changes** after each successful fix
4. **Repeat** until `turbo all` completes successfully

## Critical Rules for Agents

When delegating to agents, you MUST include these instructions:

### Scope

- Fix ONLY the specific file assigned to you
- Do NOT modify any other files unless absolutely necessary
- If you need to modify another file, report back first

### Strict Lint Rules

This codebase enforces extremely strict functional programming rules enforced by lint, including:

1. **NO method-based `.pipe()`** - Use standalone `pipe()` function only
2. **NO curried function calls** - Use `pipe(a, fn(b))` instead of `fn(b)(a)`
3. **NO nested `pipe()` calls** - Extract inner pipes to separate named functions
4. **NO multiple `pipe()` calls in one function** - One pipe per function only
5. **NO `let` statements** - Use immutable patterns
6. **NO `Effect.gen`** - Use `pipe()` and `Effect.all/Effect.forEach` instead
7. **Import `pipe` from 'effect'** when using the standalone function

These rules are to ensure we have readable, functional code. Use function names carefully to aid readability.

### Verification

- Run `turbo all` repeatedly until YOUR file is no longer the source of errors (typecheck, lint, or test failures)
- The next file may fail - that's expected and will be handled by the next agent
- Ensure your fixes don't break other files (watch for import changes, type changes, etc.)

### Testing Exclusions

Note: Files matching these patterns have relaxed rules:

- `**/*.test.ts`, `**/*.spec.ts`
- `**/testing/**/*.ts`
- `**/eventsourcing-testing-contracts/**/*.ts`

## Orchestration Strategy

### Detecting Ping-Pong

Watch for agents repeatedly breaking each other's files. Signs include:

- Same 2-3 files alternating in error list
- Type signature changes causing cascading failures
- Import/export changes affecting multiple files

### Handling Ping-Pong

If you detect ping-pong:

1. **Stop the iteration**
2. **Analyze the root cause** - usually a shared type or interface
3. **Create a coordinated fix plan** - fix the root cause first, then dependents
4. **Guide the agent explicitly** - "Fix X without changing the signature of Y"

### Progress Tracking

Use the TodoWrite tool to track:

- Which files have been fixed
- Which files are currently failing
- Any ping-pong patterns detected
- Overall progress toward clean build

## Exit Condition

Stop when `turbo all` completes with exit code 0 and shows:

```
Tasks: X successful, X total
```

With no error messages.
