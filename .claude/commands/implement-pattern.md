---
allowed-tools: '*'
description: Implement a single Effect simplification pattern from the TODO list
---

# Your Task

Implement a single Effect simplification pattern: create the ESLint rule, documentation, tests, update the TODO checklist, commit the changes, and run /fix-all to ensure everything builds cleanly.

## Workflow

Follow these steps in order:

### 1. Choose Pattern

Read `packages/eslint-effect/EFFECT_PATTERNS_TODO.md` and select the next unchecked pattern to implement. Prioritize:

- High Priority section first
- Within a section, work top-to-bottom
- Skip patterns marked with `[x]` (already completed)

### 2. Understand the Pattern

**CRITICAL:** Before implementing, verify your understanding of the pattern:

1. **Check Effect source code** at `~/Development/effect/` to understand:
   - How the simplified function works
   - Its type signature and behavior
   - Edge cases and constraints
   - Examples from Effect's own tests

2. **Study existing similar rules** in `packages/eslint-effect/src/rules/` to understand:
   - Code structure and patterns
   - How to handle piped call style (data-last)
   - AST matching patterns
   - Auto-fix implementation
   - Test structure in `packages/eslint-effect/test/`

**Note:** This codebase uses pipe exclusively. Do NOT implement detection for data-first call styles.

**Do NOT implement a rule based on assumptions. Always verify against the Effect source code first.**

### 3. Add and enable a placeholder for the rule

Create the files:

- `packages/eslint-effect/src/rules/[rule-name].js` - The ESLint rule implementation
- `packages/eslint-effect/test/[rule-name].test.ts` - Comprehensive tests

Add the new rule to `packages/eslint-effect/src/rules/index.js` exports.
Add the rule to appropriate configs in `packages/eslint-effect/src/configs.js`.
Enable ONLY your rule for your test file.

### 4. Write Tests

Tests must cover:

- Valid code (should not trigger the rule)
- Invalid code (should trigger the rule)
- Auto-fix correctness (before/after comparison)
- Edge cases (nested pipes, complex expressions, etc.)
- Multiple applicable types if relevant

The tests work by using the `eslint-disable-next-line` comment to indicate which examples should trigger the rule. Add these comments above the relevant lines in your test file.

Run `turbo test --filter=eslint-effect` to check your tests have the correct expectations.

### 5. Implement the Rule

The rule must:

- Detect the verbose pattern in piped style only
- Provide clear, helpful error messages
- Include auto-fix where safe and unambiguous
- Handle edge cases appropriately
- Support all applicable Effect data types (Effect, Option, Array, Stream, etc.)

Run `turbo test --filter=eslint-effect` frequently to ensure your implementation is correct.

### 6. Check Off Pattern

Update `packages/eslint-effect/EFFECT_PATTERNS_TODO.md`:

- Change `- [ ]` to `- [x]` for the implemented pattern
- Update the summary counts at the bottom

### 7. Run Tests

Verify the implementation:

```bash
turbo test --filter=eslint-effect
```

### 8. Commit Changes

Create a commit following conventional commits format:

```
feat(eslint-effect): add [rule-name] rule

Implements [brief description of the pattern being simplified]
- Supports piped call style
- Includes auto-fix for safe transformations
- Comprehensive test coverage
```

### 9. Run /fix-all

Invoke the `/fix-all` command to ensure the entire codebase builds cleanly with the new rule.

## Important Notes

### Rule Naming Convention

Follow the pattern: `prefer-[simplified-name]`

- `prefer-as` (not `prefer-effect-as`)
- `prefer-flatten` (not `prefer-flatmap-identity`)
- `prefer-from-nullable` (not `prefer-option-from-nullable`)

### Multi-Type Support

If a pattern applies to multiple types (e.g., Effect, Option, Stream), the rule should detect all of them. Check the pattern description for "Also applies to:" section.

### Auto-Fix Safety

Only implement auto-fix when:

- The transformation is semantically identical
- No side effects are altered
- Type safety is preserved
- The pattern is unambiguous

### Edge Cases

Consider:

- Nested pipes
- Complex expressions as arguments
- Type inference implications
- Preserving comments and formatting
- Similar but distinct patterns (avoid false positives)

### Testing Philosophy

Be thorough! Test files should include:

- Multiple valid examples
- Multiple invalid examples with expected messages
- Auto-fix transformations
- Edge cases specific to this pattern
- Examples from real codebases if available

## Quality Checklist

Before committing, verify:

- [ ] Rule detects all pattern variations
- [ ] Rule handles piped call style correctly
- [ ] Auto-fix is safe and correct
- [ ] Tests are comprehensive
- [ ] All tests pass locally
- [ ] Pattern is checked off in TODO
- [ ] Rule is added to index and configs
- [ ] Commit message follows conventions
- [ ] /fix-all passes

## Example Run

```
Reading EFFECT_PATTERNS_TODO.md...
Next pattern: prefer-flatten - flatMap(identity) → flatten

Studying similar rules...
- prefer-as: Shows map detection and auto-fix
- prefer-as-void: Shows void handling
- no-identity-transform: Shows identity function detection

Creating rule implementation...
[writes packages/eslint-effect/src/rules/prefer-flatten.js]

Creating tests...
[writes packages/eslint-effect/test/prefer-flatten.test.ts]

Updating index...
Updating configs...

Running tests...
✓ All tests pass

Updating TODO checklist...
- [x] prefer-flatten

Committing...
[creates commit]

Running /fix-all...
[invokes fix-all command]
```

## Error Handling

If anything fails:

1. Fix the immediate issue
2. Re-run tests
3. Don't proceed until tests pass
4. If stuck, ask for clarification

## When Complete

Report:

- Which pattern was implemented
- Number of test cases created
- Whether auto-fix was implemented
- Any interesting edge cases discovered
- Current progress (X/277 patterns completed)
