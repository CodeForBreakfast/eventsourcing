# Effect Language Service Integration Design

**Date:** 2025-10-25
**Status:** Approved
**Related Issue:** hp-1

## Overview

This design integrates the Effect Language Service CLI into the brownsauce monorepo to provide compile-time diagnostics for Effect-specific issues. The integration enables TypeScript's compiler to catch Effect problems (floating Effects, incorrect yield usage, missing service dependencies) during normal type-checking, with hard enforcement that fails builds on violations.

## Goals

- Enable Effect-specific diagnostics at compile time through TypeScript patching
- Fail builds on Effect-specific issues (hard enforcement)
- Integrate seamlessly with existing turbo task infrastructure
- Provide clear, actionable error messages in IDE and CLI
- Zero additional commands for developers to remember

## Non-Goals

- Separate diagnostic commands or CI/CD tasks
- Soft warnings or lenient modes
- Per-package patching strategies
- Runtime Effect validation (this is compile-time only)

## Design

### 1. TypeScript Patching Setup

**Objective:** Enable Effect-specific diagnostics through TypeScript language service patching.

**Implementation:**

- Add `effect-ls patch` command to root-level `package.json` prepare script
- Patch runs automatically on `bun install` via npm lifecycle hooks
- Modifies TypeScript's language service to understand Effect-specific patterns
- All packages in monorepo inherit the patched TypeScript from shared root `node_modules`

**Script changes:**

```json
{
  "scripts": {
    "prepare": "husky && effect-ls patch"
  }
}
```

**Characteristics:**

- Idempotent: safe to run multiple times
- Single point of patching serves entire monorepo
- Automatic via npm lifecycle - fresh worktrees get patched on `bun install`
- Works with existing husky git hooks setup

### 2. Build Integration and Error Enforcement

**Objective:** Surface Effect errors through existing TypeScript compilation with hard enforcement.

**Implementation:**

- Each package's existing `check` or `build` task runs `tsc --noEmit` (or similar)
- With patched TypeScript, these tasks automatically include Effect-specific errors:
  - Floating Effects (unhandled Effect values)
  - Incorrect `yield*` usage in `Effect.gen`
  - Multiple Effect versions detected
  - Missing service dependencies
- No changes to turbo.json task definitions required
- Existing CI/CD pipelines running `turbo check` or `turbo build` automatically fail on Effect issues

**Error visibility:**

- **IDE (VS Code):** Effect errors appear inline as TypeScript errors
- **CLI:** Effect errors shown during `tsc` with file:line references
- **CI/CD:** Build logs include Effect errors alongside normal type errors
- **Developer experience:** Effect issues treated as type errors - no mental context switch

**Enforcement:**

- Hard enforcement: builds fail on any Effect-specific diagnostic
- Errors clearly labeled by effect-ls
- Mixed with normal TypeScript errors but distinguishable by message content

### 3. Verification Strategy

**Objective:** Confirm patching works correctly and catches real Effect issues.

**Verification steps:**

1. **Confirm patch is active:**

   ```bash
   effect-ls check
   ```

   - Should report TypeScript is successfully patched

2. **Surface existing Effect issues:**

   ```bash
   turbo check
   ```

   - Runs existing type-checking tasks across all packages
   - With patched TypeScript, reveals all Effect-specific issues
   - Creates natural baseline - passing means no issues, failing reveals work needed

3. **Optional enforcement test:**
   - Add deliberate floating Effect to test file
   - Confirm `turbo check` catches it with clear error message
   - Verify error is actionable
   - Delete test after confirmation

**Verification checklist:**

- [ ] `effect-ls check` reports TypeScript is patched
- [ ] `turbo check` runs and surfaces any Effect issues (or passes if clean)
- [ ] Error messages are clear and actionable

## Architecture Decisions

### Why integrated TypeScript build vs. separate diagnostic tasks?

**Considered alternatives:**

1. **Patch + extend existing check tasks:** Add effect-ls diagnostics to existing turbo check tasks
2. **Separate effect:check task:** Create dedicated turbo tasks per package for Effect validation
3. **Integrated TypeScript build:** Patch once, rely on tsc to surface errors (chosen)

**Decision rationale:**

- Cleanest developer experience - Effect errors are just type errors
- Zero additional task configuration in turbo.json
- Works everywhere TypeScript runs (IDE, CLI, CI) without special setup
- No mental overhead of separate commands or task names
- Enforcement is automatic and unavoidable

**Trade-offs accepted:**

- Effect errors mixed with TypeScript errors (but clearly labeled)
- Cannot selectively disable Effect checking without unpatching

### Why root-level patching only?

**Alternative considered:** Per-package patching via individual prepare scripts

**Decision rationale:**

- Single shared node_modules in workspace setup means one patch serves all packages
- Simpler mental model - patch once at root, benefits everywhere
- Avoid redundant patching overhead
- Consistent TypeScript behavior across entire monorepo

## Implementation Plan

Implementation will be handled in separate planning phase following this design approval.

High-level steps:

1. Update root package.json prepare script
2. Run `bun install` to trigger patch
3. Verify with `effect-ls check`
4. Run `turbo check` to surface any existing issues
5. Fix or document any discovered Effect issues
6. Commit and create PR

## Success Criteria

- [ ] `effect-ls check` reports TypeScript is patched
- [ ] All existing turbo check/build tasks pass (or reveal legitimate Effect issues)
- [ ] Introducing a floating Effect causes build failure
- [ ] Error messages clearly identify Effect-specific problems
- [ ] CI/CD pipeline fails on Effect violations
- [ ] IDE shows Effect errors inline during development
- [ ] No additional commands needed for developers

## Risks and Mitigations

| Risk                                                      | Mitigation                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Existing code has Effect issues that block PR             | Run initial `turbo check` to discover scope; create follow-up issues for fixes if needed               |
| Patch breaks on TypeScript version updates                | Effect-LS installed as devDependency, version-locked to TypeScript; Renovate will update both together |
| Developers confused by Effect errors mixed with TS errors | Error messages from effect-ls are clearly labeled; can add documentation if needed                     |
| Fresh worktrees forget to patch                           | Prepare script runs automatically on `bun install`; documented in CLAUDE.md worktree workflow          |

## References

- Effect Language Service: https://effect.website/docs/other/language-service
- Current devDependency version: `@effect/language-service@0.47.1`
- Related Beads issue: hp-1
