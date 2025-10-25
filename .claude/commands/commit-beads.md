---
allowed-tools: Bash(git status:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git pull:*), Bash(gh pr:*), Bash(git branch:*), Bash(cd:*), Bash(pwd:*), Bash(git diff:*), Bash(bd list:*), Bash(bd show:*)
description: Commit beads database changes to a dedicated branch with meaningful names based on actual changes
---

## Your task

This command handles committing the shared `.beads/` database to its own branch and PR, with intelligent naming based on what actually changed.

1. **Navigate to repo root:**
   - Run `pwd` to check current location
   - If in a worktree, navigate back to repo root by using `cd` with the full path to brownsauce (not a worktree)
   - Run `pwd` again to confirm you're at repo root

2. **Check for beads changes:**
   - Run `git status .beads/` to check if beads has uncommitted changes
   - If no changes, inform user and exit

3. **Analyze what changed:**
   - Run `git diff .beads/issues.jsonl` to see the raw changes
   - Parse the diff to identify:
     - New issues created (look for lines starting with `+` that have full issue records)
     - Issues closed (status changed to "closed")
     - Issues updated (status changes, priority changes, etc.)
     - New dependencies added
   - Generate a descriptive summary like:
     - "created hp-123, hp-124, hp-125" (if multiple issues created)
     - "closed hp-42" (if single issue closed)
     - "updated 3 issues" (if general updates)
     - Use the most significant change as the primary descriptor

4. **Create descriptive branch name:**
   - Based on analysis, create a kebab-case branch name like:
     - `chore/beads-create-hp-123-hp-124` (for new issues)
     - `chore/beads-close-hp-42` (for closing issues)
     - `chore/beads-update-dependencies` (for dep changes)
     - `chore/beads-sync-$(date +%Y%m%d)` (fallback for complex changes)

5. **Update main and create branch:**
   - Run `git pull origin main` to ensure main is up to date
   - Create the descriptive branch: `git checkout -b {branch-name}`

6. **Commit beads changes:**
   - Run `git add .beads/`
   - Create descriptive commit message based on the same analysis:
     - `chore: create beads issues hp-123, hp-124, hp-125`
     - `chore: close beads issue hp-42`
     - `chore: update beads dependencies`
   - Run `git commit -m "{descriptive-message}"`
   - Run `git push -u origin HEAD`

7. **Create PR with automerge:**
   - Create PR with same descriptive title: `gh pr create --title "{commit-message}" --body "Beads database sync: {brief-summary-of-changes}"`
   - Enable automerge with squash: `gh pr merge --auto --squash`
   - Show PR URL to user

8. **Monitor and report:**
   - Run `gh pr checks --watch` to monitor CI checks
   - After checks pass, verify merge status with `gh pr status`
   - Report when merged successfully

9. **Clean up after merge:**
   - Return to main: `git checkout main`
   - Pull latest: `git pull origin main`
   - Delete local beads branch using the actual branch name created in step 4

## Important notes

- MUST run from repo root, not from a worktree
- Analyze changes BEFORE creating branch/commit to generate meaningful names
- If diff is complex, use bd commands to get context (e.g., `bd show hp-123` to see what the issue is about)
- Branch names should be concise but descriptive
- Squash merge keeps git history clean
- If checks fail, report failure and leave branch intact for debugging
