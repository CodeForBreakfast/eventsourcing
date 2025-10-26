# Skip CI Workflows for Beads-Only PRs

**Date:** 2025-10-26
**Status:** Approved
**Issue:** hp-11

## Problem

The CI workflow runs build, lint, test, and validation on every PR to main, including PRs that only modify the beads issue database (`.beads/issues.jsonl`). This is unnecessary and wasteful:

- Beads-only PRs have no code changes to validate
- CI takes several minutes and consumes GitHub Actions quota
- Recent example: PR #324 changed only `.beads/issues.jsonl` but triggered full CI

Similarly, when beads-only PRs merge to main, the release workflow runs unnecessarily since there are no packages to version or publish.

## Solution: Use `paths-ignore` Filter

Add GitHub Actions' built-in `paths-ignore` filter to both CI and release workflows to completely skip execution when only `.beads/issues.jsonl` changes.

### Implementation

**ci.yml** - Skip CI workflow for beads-only PRs:

```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - '.beads/issues.jsonl'
```

**release.yml** - Skip release workflow for beads-only pushes to main:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '.beads/issues.jsonl'
```

**publish-with-token.yml** - No change (manual workflow only)

### Behavior

When a PR only changes `.beads/issues.jsonl`:

- GitHub doesn't trigger the CI workflow at all
- No workflow status appears in PR checks
- PR is mergeable without waiting for CI
- After merge, release workflow also skips

When a PR changes `.beads/issues.jsonl` AND any other file:

- Workflows run normally (paths-ignore doesn't apply)
- Full CI validation occurs

### Edge Cases

1. **Mixed changes** - PR changes `.beads/issues.jsonl` + other files
   - Workflows run normally
   - Any code change needs full CI validation

2. **Renovate PRs** - Bot PRs that update dependencies
   - Workflows run normally (don't touch `.beads/issues.jsonl`)
   - Dependency updates need CI to catch breaking changes

3. **Multiple beads files** (future-proofing)
   - Only `.beads/issues.jsonl` is currently ignored
   - Future beads files won't be ignored unless explicitly added
   - Conservative approach - only skip what we know is safe

4. **Empty PRs** - PR with no file changes
   - Workflows run (GitHub doesn't treat this as paths-ignore match)
   - Edge case that shouldn't happen in practice

### Testing and Validation

**Verification steps:**

1. **Beads-only PR test**
   - Change only `.beads/issues.jsonl`
   - Verify no CI workflow appears in PR checks
   - Verify PR is mergeable

2. **Mixed-change PR test**
   - Change `.beads/issues.jsonl` + any code file
   - Verify CI workflow runs normally
   - Verify all checks complete

3. **Post-merge test**
   - Merge a beads-only PR to main
   - Verify release workflow doesn't run
   - Check Actions tab shows no release workflow triggered

4. **Renovate test**
   - Wait for next renovate PR
   - Verify CI runs normally for dependency updates

**Rollback plan:**
Remove the `paths-ignore` lines from both workflows to return to previous behavior immediately. The change is purely additive to trigger conditions.

### Documentation Updates

Update CLAUDE.md to document that beads-only PRs skip CI. No user-facing documentation needed - this is transparent automation behavior.

## Alternatives Considered

**Conditional job with changed-files action:**

- Add detection job using changed-files action
- Make CI job depend on detection result
- More flexible but adds complexity and extra job
- Rejected: Unnecessary complexity for simple use case

**Early exit in CI job:**

- Keep workflow trigger unchanged
- Detect file changes at start of CI job and exit early
- Workflow still runs but exits immediately
- Rejected: Workflow still consumes Actions quota and appears in PR checks

## Trade-offs

**Benefits:**

- Faster PR merges for beads-only changes
- Reduced GitHub Actions quota consumption
- Cleaner PR checks UI (no irrelevant workflows)

**Drawbacks:**

- Beads-only PRs show no CI checks in GitHub UI
- If branch protection requires CI checks, rules need adjustment
- Less obvious that automation considered and skipped the PR

The benefits outweigh drawbacks since beads-only PRs have nothing to validate and the skip behavior is intentional.
