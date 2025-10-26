# Skip CI Workflows for Beads-Only PRs - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Skip CI and release workflows when PRs only change `.beads/issues.jsonl` to reduce Actions quota usage and speed up beads-only PR merges.

**Architecture:** Add GitHub Actions `paths-ignore` filter to workflow triggers in `ci.yml` and `release.yml`. This declarative approach prevents workflow execution entirely when only ignored paths change.

**Tech Stack:** GitHub Actions workflow YAML configuration

---

## Task 1: Update CI workflow to skip beads-only PRs

**Files:**

- Modify: `.github/workflows/ci.yml:4-6`

**Step 1: Read current ci.yml trigger configuration**

Run: `cat .github/workflows/ci.yml | head -20`

Expected: See current trigger block starting at line 4:

```yaml
on:
  pull_request:
    branches: [main]
```

**Step 2: Add paths-ignore to CI workflow trigger**

Edit `.github/workflows/ci.yml` lines 4-6 to add `paths-ignore`:

```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - '.beads/issues.jsonl'
```

**Step 3: Verify YAML syntax is valid**

Run: `bun run -c 'import yaml from "js-yaml"; import fs from "fs"; console.log(yaml.load(fs.readFileSync(".github/workflows/ci.yml", "utf8")) ? "✓ Valid YAML" : "✗ Invalid");'`

Alternative: Use online YAML validator or GitHub's workflow validation

Expected: YAML is syntactically valid

**Step 4: Commit CI workflow change**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: skip CI workflow for beads-only PRs

Add paths-ignore filter to skip CI when only .beads/issues.jsonl changes.
This reduces Actions quota usage and speeds up beads-only PR merges.

Issue: hp-11"
```

---

## Task 2: Update release workflow to skip beads-only merges

**Files:**

- Modify: `.github/workflows/release.yml:4-7`

**Step 1: Read current release.yml trigger configuration**

Run: `cat .github/workflows/release.yml | head -20`

Expected: See current trigger block starting at line 4:

```yaml
on:
  push:
    branches:
      - main
```

**Step 2: Add paths-ignore to release workflow trigger**

Edit `.github/workflows/release.yml` lines 4-7 to add `paths-ignore`:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '.beads/issues.jsonl'
```

**Step 3: Verify YAML syntax is valid**

Run: `bun run -c 'import yaml from "js-yaml"; import fs from "fs"; console.log(yaml.load(fs.readFileSync(".github/workflows/release.yml", "utf8")) ? "✓ Valid YAML" : "✗ Invalid");'`

Expected: YAML is syntactically valid

**Step 4: Commit release workflow change**

```bash
git add .github/workflows/release.yml
git commit -m "ci: skip release workflow for beads-only merges

Add paths-ignore filter to skip release workflow when only
.beads/issues.jsonl changes are merged to main. No packages change
in beads-only merges, so release workflow has nothing to do.

Issue: hp-11"
```

---

## Task 3: Document behavior in CLAUDE.md

**Files:**

- Modify: `CLAUDE.md` (add new section after Beads documentation)

**Step 1: Find insertion point in CLAUDE.md**

Run: `grep -n "## Beads" CLAUDE.md`

Expected: Find the Beads section (likely around line 40-50)

**Step 2: Add CI skip documentation after Beads section**

Add this new section after the "Beads (bd) Issue Tracking" section in `CLAUDE.md`:

```markdown
### CI Workflow Optimization

**Beads-only PRs skip CI:**

- PRs that only change `.beads/issues.jsonl` automatically skip CI and release workflows
- Uses GitHub Actions `paths-ignore` filter for complete skip (no workflow run at all)
- These PRs show no CI checks in GitHub UI - this is intentional and correct
- Beads-only PRs are mergeable immediately without waiting for CI

**When CI still runs:**

- Any PR that changes `.beads/issues.jsonl` + other files runs CI normally
- Renovate dependency update PRs always run CI
- Any code, config, or dependency changes require full validation
```

**Step 3: Verify documentation clarity**

Read the new section and ensure:

- Explains what happens (skip CI for beads-only PRs)
- Explains why (no code to validate)
- Clarifies edge cases (mixed changes, renovate)
- Notes the UI behavior (no checks shown)

**Step 4: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "docs: document CI skip for beads-only PRs

Explain that beads-only PRs skip CI workflows and show no checks
in GitHub UI. Clarify when CI still runs (mixed changes, renovate).

Issue: hp-11"
```

---

## Task 4: Push branch and create PR

**Files:** N/A (git operations)

**Step 1: Push feature branch to origin**

Run: `git push -u origin feat/skip-ci-beads-prs`

Expected: Branch pushed successfully, remote tracking set up

**Step 2: Create pull request**

Run:

```bash
gh pr create --title "ci: skip CI workflows for beads-only PRs" --body "$(cat <<'EOF'
## Summary

- Add `paths-ignore` filter to CI workflow to skip when only `.beads/issues.jsonl` changes
- Add `paths-ignore` filter to release workflow to skip on beads-only merges to main
- Document behavior in CLAUDE.md

## Why

Beads-only PRs have no code changes to validate. Skipping CI reduces Actions quota usage and speeds up PR merges.

## Behavior

**Beads-only PRs:**
- No CI workflow runs (complete skip)
- No checks appear in PR UI
- Mergeable immediately

**Mixed changes:**
- CI runs normally
- Full validation occurs

## Testing

This PR itself will trigger CI because it changes workflow files + docs.

After merge, test by:
1. Creating a PR that only changes `.beads/issues.jsonl`
2. Verifying no CI checks appear
3. Verifying PR is mergeable

## Related

Closes hp-11
EOF
)"
```

Expected: PR created successfully with PR number

**Step 3: Verify PR shows CI checks**

Run: `gh pr view --web`

Expected:

- PR opens in browser
- CI workflow IS running (because this PR changes workflows + docs, not just beads)
- This confirms CI runs for non-beads-only changes

**Step 4: Note PR number for testing**

Run: `gh pr view --json number -q .number`

Expected: Returns PR number (e.g., "325")

Make note of this for post-merge verification testing.

---

## Task 5: Post-merge verification (after PR merges)

**Prerequisites:**

- PR from Task 4 has been reviewed and merged to main
- You're back in the repo root or main worktree

**Files:**

- Create: `.beads/issues.jsonl` (test change only)

**Step 1: Create test worktree for beads-only PR**

Run:

```bash
cd /Users/graemefoster/Development/brownsauce
git fetch origin main
git worktree add worktrees/test-beads-ci-skip -b test/beads-ci-skip
cd worktrees/test-beads-ci-skip
```

Expected: New test worktree created

**Step 2: Make beads-only change**

Run:

```bash
bd create "Test CI skip functionality" -p 4 -t task
```

Expected: New issue created in `.beads/issues.jsonl`

**Step 3: Commit and push beads-only change**

Run:

```bash
git add .beads/issues.jsonl
git commit -m "test: verify CI skip for beads-only PRs"
git push -u origin test/beads-ci-skip
```

Expected: Branch pushed successfully

**Step 4: Create test PR and verify no CI**

Run:

```bash
gh pr create --title "test: verify CI skip for beads-only PRs" --body "This PR only changes .beads/issues.jsonl to verify CI skip works. Should show NO CI checks."
```

Expected: PR created

**Step 5: Check PR has no CI workflow**

Run: `gh pr checks`

Expected: No checks listed, or message indicating no checks required

Alternative: `gh pr view --web` and visually confirm no CI checks appear in the PR

**Step 6: Verify PR is mergeable**

Run: `gh pr view --json mergeable,mergeStateStatus -q '{mergeable: .mergeable, status: .mergeStateStatus}'`

Expected: `mergeable: MERGEABLE` (even without CI checks)

**Step 7: Close test PR and clean up**

Run:

```bash
gh pr close --delete-branch --comment "Verification complete: CI correctly skipped for beads-only PR"
bd close $(bd list --status open | grep "Test CI skip" | awk '{print $1}') --reason "Test complete"
cd /Users/graemefoster/Development/brownsauce
git worktree remove worktrees/test-beads-ci-skip
```

Expected: Test PR closed, branch deleted, beads issue closed, worktree removed

**Step 8: Verify release workflow also skips**

Check GitHub Actions tab for main branch after merging the test PR:

- Go to: `gh repo view --web` → Actions tab
- Verify no release workflow triggered by the test PR merge
- Only beads-only merge, so release should be skipped

Expected: No release workflow run for the test PR merge

---

## Success Criteria

- [ ] CI workflow has `paths-ignore: ['.beads/issues.jsonl']` in trigger
- [ ] Release workflow has `paths-ignore: ['.beads/issues.jsonl']` in trigger
- [ ] CLAUDE.md documents the CI skip behavior
- [ ] Implementation PR merged successfully
- [ ] Test beads-only PR shows no CI checks
- [ ] Test beads-only PR is mergeable without CI
- [ ] Release workflow doesn't run for beads-only merge to main
- [ ] Mixed-change PRs (like implementation PR) still run CI normally

## Notes for Engineer

**This is workflow configuration, not code:**

- No unit tests to write (TDD doesn't apply here)
- Verification is done through actual PR creation and observation
- The "tests" are manual checks in GitHub UI

**YAML syntax matters:**

- Indentation must be exact (2 spaces per level)
- `paths-ignore` is an array, needs the `-` prefix
- Quote the path string for safety

**Git worktrees:**

- Post-merge verification uses a fresh worktree to avoid contaminating main
- This project uses worktrees for all feature work
- Test worktree is temporary and gets cleaned up after verification

**If something goes wrong:**

- Remove `paths-ignore` lines to rollback immediately
- Workflows return to previous behavior (run on all PRs)
- No code changes involved, so rollback is zero-risk
