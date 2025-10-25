# Effect Language Service Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable compile-time Effect diagnostics by patching TypeScript to catch Effect-specific issues during normal type-checking.

**Architecture:** Modify root prepare script to run effect-ls patch on install, verify patching works, then validate that existing turbo tasks surface Effect errors.

**Tech Stack:**

- @effect/language-service@0.47.1 (already installed)
- TypeScript 5.9.3
- Bun package manager
- Turbo monorepo orchestration

---

## Task 1: Update Root Package Prepare Script

**Files:**

- Modify: `/Users/graemefoster/Development/brownsauce/worktrees/effect-ls-cli/package.json:20`

**Context:** The prepare script currently only runs `husky`. We need to add `effect-ls patch` to enable Effect diagnostics at compile time.

**Step 1: Read current package.json prepare script**

Run:

```bash
cat package.json | jq '.scripts.prepare'
```

Expected output:

```
"husky"
```

**Step 2: Modify prepare script to include effect-ls patch**

Edit package.json line 20:

Before:

```json
"prepare": "husky",
```

After:

```json
"prepare": "husky && effect-ls patch",
```

**Why this order:** husky sets up git hooks first, then effect-ls patches TypeScript. Both must succeed for prepare to succeed.

**Step 3: Verify the change**

Run:

```bash
cat package.json | jq '.scripts.prepare'
```

Expected output:

```
"husky && effect-ls patch"
```

**Step 4: Commit the change**

```bash
git add package.json
git commit -m "chore: add effect-ls patch to prepare script

Enable Effect-specific TypeScript diagnostics by patching TypeScript's
language service on install.

Related: hp-1"
```

Expected: Commit succeeds with message about running hooks (gitleaks, lint-staged).

---

## Task 2: Trigger TypeScript Patching

**Files:**

- None (runs existing script)

**Context:** The prepare script only runs on `bun install`. We need to trigger it manually to apply the patch without removing/reinstalling node_modules.

**Step 1: Run bun install to trigger prepare script**

Run:

```bash
bun install
```

Expected output (key lines to look for):

```
$ husky && effect-ls patch
✓ TypeScript patched successfully
```

**Why bun install:** The prepare npm lifecycle hook runs after `install` and before `postinstall`. Even if dependencies are already installed, prepare will run.

**Step 2: Verify node_modules structure**

The patch modifies TypeScript files in node_modules. Check that typescript directory exists:

Run:

```bash
ls node_modules/typescript/lib/ | grep -E "tsserver.js|typescript.js" | head -2
```

Expected output:

```
tsserver.js
typescript.js
```

**Context:** effect-ls patch modifies these TypeScript compiler files to inject Effect-specific diagnostics.

---

## Task 3: Verify Patch Is Active

**Files:**

- None (verification only)

**Context:** effect-ls provides a check command to confirm TypeScript is successfully patched.

**Step 1: Run effect-ls check command**

Run:

```bash
npx effect-ls check
```

Expected output:

```
✓ TypeScript is patched
```

**If patch failed:** Output would show:

```
✗ TypeScript is not patched
Run 'effect-ls patch' to enable diagnostics
```

**Step 2: Document verification in terminal**

No commit needed - this is verification only. If check passes, proceed to next task.

---

## Task 4: Test Enforcement with Deliberate Error

**Files:**

- Create: `/Users/graemefoster/Development/brownsauce/worktrees/effect-ls-cli/test-effect-error.ts`

**Context:** Before running on real code, verify the patch catches Effect-specific issues with a controlled test.

**Step 1: Create test file with floating Effect**

Create `test-effect-error.ts` at repository root:

```typescript
import { Effect } from 'effect';

// This is a deliberate floating Effect - should cause error
Effect.succeed(42);

console.log('This file intentionally has an Effect error');
```

**Why floating Effect:** An Effect that is created but not handled (not run, not returned, not assigned) is a common mistake. effect-ls should flag this.

**Step 2: Run TypeScript on the test file**

Run:

```bash
npx tsc --noEmit test-effect-error.ts
```

Expected output (should show Effect-specific error):

```
test-effect-error.ts:4:1 - error EFFECT-XXXX: Floating Effect detected

Effect.succeed(42)
^~~~~~~~~~~~~~~~~~

  This Effect value is created but never used. Did you forget to handle it?
```

**If no error shown:** Patch may not be working. Return to Task 3.

**Step 3: Verify error message clarity**

The error should:

- Point to the exact line (line 4)
- Identify it as an Effect-specific issue (not standard TypeScript error)
- Provide actionable guidance

**Step 4: Delete test file**

Run:

```bash
rm test-effect-error.ts
```

Expected: File removed, no git changes to commit.

**Step 5: Verify file is deleted**

Run:

```bash
ls test-effect-error.ts 2>&1
```

Expected output:

```
ls: test-effect-error.ts: No such file or directory
```

---

## Task 5: Run Baseline TypeCheck on Real Codebase

**Files:**

- None (verification only)

**Context:** Now that patching is verified, run typecheck on actual codebase to establish baseline. This may reveal existing Effect issues that need addressing.

**Step 1: Run turbo typecheck**

Run:

```bash
turbo typecheck
```

Expected: One of two outcomes:

**Outcome A - Clean codebase:**

```
✓ typecheck
✓ All tasks completed successfully
```

**Outcome B - Existing Effect issues found:**

```
× typecheck failed
packages/some-package/src/file.ts:XX:X - error EFFECT-XXX: [Effect issue description]
```

**Step 2: Document any Effect issues found**

If Outcome B occurs, create list of issues found:

Run:

```bash
turbo typecheck 2>&1 | grep "error EFFECT" > effect-issues-baseline.txt
```

This creates a baseline of Effect-specific errors to address (if any exist).

**Step 3: Decide on next steps based on outcome**

**If Outcome A (no issues):**

- Codebase is clean
- Proceed to Task 6 (document success)

**If Outcome B (issues found):**

- Review effect-issues-baseline.txt
- Create follow-up Beads issues for each category of Effect error
- Add discovered-from dependency to hp-1
- May need to fix issues before merging this PR, or document as known issues

**Do not commit baseline file** - this is diagnostic output only.

---

## Task 6: Run Full CI Pipeline Validation

**Files:**

- None (verification only)

**Context:** Verify that Effect diagnostics work through the full CI pipeline, not just typecheck in isolation.

**Step 1: Run turbo ci task**

Run:

```bash
turbo ci
```

Expected: Full CI pipeline runs including build, lint, test, and all checks.

**Outcome depends on Task 5 results:**

**If Task 5 was clean:**

```
✓ ci
  ✓ build
  ✓ lint
  ✓ test
  ✓ arch:check
  ✓ deps:check
  ✓ release:validate
✓ All tasks completed successfully
```

**If Task 5 found Effect issues:**

```
× ci failed
  × build failed (Effect errors from Task 5)
```

**Step 2: Verify Effect errors surface in build task**

If issues exist, confirm they appear during build (not just typecheck):

Run:

```bash
turbo build 2>&1 | grep "error EFFECT"
```

Expected: Same Effect errors from Task 5 appear during build.

**Why this matters:** Confirms Effect diagnostics are integrated into normal compilation, not just a separate typecheck step.

**Step 3: Assess merge readiness**

**Merge-ready scenarios:**

- No Effect issues found in Task 5/6
- Effect issues found but documented in follow-up Beads issues
- Effect issues found and fixed in this PR

**Not merge-ready:**

- Effect issues found and blocking (must fix or disable enforcement)

---

## Task 7: Update Beads Issue with Results

**Files:**

- None (Beads update only)

**Context:** Document what was accomplished and surface any discovered work.

**Step 1: Determine completion status**

Based on Task 5 and Task 6 outcomes:

**If no Effect issues found:**

```bash
bd close hp-1 --reason "Effect-LS integration complete. TypeScript patching enabled, no existing Effect issues found. Build enforcement active."
```

**If Effect issues found and documented:**

```bash
# First create follow-up issues for discovered problems
bd create "Fix floating Effects in eventsourcing-aggregates" -p 1 -t bug --deps discovered-from:hp-1
bd create "Fix incorrect yield usage in eventsourcing-store" -p 1 -t bug --deps discovered-from:hp-1

# Then close this issue
bd close hp-1 --reason "Effect-LS integration complete. TypeScript patching enabled. Discovered Effect issues documented in follow-up tasks."
```

**Step 2: Verify issue status**

Run:

```bash
bd show hp-1
```

Expected: Status shows "closed" with completion reason.

**Step 3: Check for newly ready work**

Run:

```bash
bd ready --limit 5
```

Expected: If follow-up issues were created, they may now be ready to work on.

---

## Task 8: Create Changeset

**Files:**

- Create: `.changeset/<random-id>.md`

**Context:** Document this change for release notes, even though it's a development-only change (not published to npm).

**Step 1: Generate changeset**

Run:

```bash
bun changeset
```

Interactive prompts:

```
? Which packages would you like to include?
  › (none - this is a monorepo-wide change)

? Which packages should have a major bump?
  › (none)

? Which packages should have a minor bump?
  › (none)

? Which packages should have a patch bump?
  › (none - this doesn't affect published packages)

? Please enter a summary for this change (this will be used as the commit message):
  › Enable Effect-specific TypeScript diagnostics via effect-ls patching
```

**Alternative:** Since this doesn't affect published packages, you may skip changeset.

**Step 2: Review generated changeset file**

If changeset was created:

Run:

```bash
cat .changeset/*.md | grep -A 5 "effect-ls"
```

Expected: Changeset file with summary.

**Step 3: Commit changeset if created**

If changeset was created:

```bash
git add .changeset/
git commit -m "chore: add changeset for effect-ls integration"
```

**If skipping changeset:** No commit needed.

---

## Task 9: Final Commit and Verification

**Files:**

- None (verification only)

**Context:** Ensure all changes are committed and worktree is clean.

**Step 1: Verify working tree is clean**

Run:

```bash
git status
```

Expected output:

```
On branch feat/effect-ls-cli
nothing to commit, working tree clean
```

**If untracked files exist:**

- `effect-issues-baseline.txt` - should be deleted (diagnostic file)
- Other files - review and either commit or add to .gitignore

**Step 2: Review commit history**

Run:

```bash
git log --oneline -n 5
```

Expected commits (in order, newest first):

```
<hash> chore: add changeset for effect-ls integration (optional)
<hash> chore: add effect-ls patch to prepare script
<hash> docs: add Effect Language Service integration design
```

**Step 3: Verify remote branch exists**

Run:

```bash
git branch -vv
```

Expected output showing tracking:

```
* feat/effect-ls-cli <hash> [origin/feat/effect-ls-cli] chore: add effect-ls patch to prepare script
```

**If no remote tracking:**

```bash
git push -u origin feat/effect-ls-cli
```

**Step 4: Confirm all verification steps passed**

Checklist:

- [ ] `effect-ls check` reports TypeScript is patched
- [ ] `turbo typecheck` runs (passes or surfaces Effect issues)
- [ ] `turbo ci` includes Effect diagnostics
- [ ] Beads issue hp-1 is closed
- [ ] All changes committed
- [ ] Branch pushed to remote

---

## Task 10: Create Pull Request

**Files:**

- None (GitHub PR creation)

**Context:** Submit changes for review via pull request.

**Step 1: Create PR using gh CLI**

Run:

```bash
gh pr create --title "chore: enable Effect-LS compile-time diagnostics" --body "$(cat <<'EOF'
## Summary

Enables Effect-specific TypeScript diagnostics by integrating @effect/language-service into the build pipeline.

## Changes

- Modified root `package.json` prepare script to run `effect-ls patch`
- TypeScript is now patched on `bun install` to surface Effect-specific errors
- Effect issues appear during normal type-checking (turbo typecheck/build/ci)

## Verification

- [x] `effect-ls check` confirms TypeScript is patched
- [x] `turbo typecheck` surfaces Effect diagnostics
- [x] `turbo ci` includes Effect validation
- [x] Deliberate floating Effect causes build failure
- [x] Error messages are clear and actionable

## Effect Issues Found

<!-- If Task 5 found issues, list them here or link to follow-up Beads issues -->

None / See follow-up issues: hp-X, hp-Y

## Design

See [Effect Language Service Integration Design](docs/plans/2025-10-25-effect-language-service-integration-design.md)

## Related

Closes hp-1
EOF
)"
```

Expected: PR created and URL returned.

**Step 2: Verify PR was created**

Run:

```bash
gh pr view
```

Expected: PR details displayed in terminal.

**Step 3: Open PR in browser (optional)**

Run:

```bash
gh pr view --web
```

Expected: Browser opens to PR page.

---

## Success Criteria

All tasks completed successfully if:

- [x] Root package.json prepare script includes `effect-ls patch`
- [x] `effect-ls check` confirms TypeScript is patched
- [x] Deliberate floating Effect causes type error
- [x] `turbo typecheck` and `turbo ci` surface Effect diagnostics
- [x] Beads issue hp-1 is closed
- [x] Pull request created
- [x] No uncommitted changes in working tree

## Potential Issues and Solutions

| Issue                                               | Solution                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `effect-ls check` reports not patched after install | Re-run `bun install`, check for errors in prepare script output                     |
| Deliberate Effect error not caught                  | Verify effect-ls version matches TypeScript version compatibility                   |
| Existing codebase has many Effect issues            | Create follow-up Beads issues, prioritize fixes, or temporarily disable enforcement |
| CI fails on unrelated issues                        | Fix issues or document as known problems unrelated to this PR                       |
| Prepare script fails in CI                          | Ensure CI environment has bun and effect-ls installed                               |

## References

- Design document: `docs/plans/2025-10-25-effect-language-service-integration-design.md`
- Effect Language Service docs: https://effect.website/docs/other/language-service
- Beads issue: hp-1
