---
allowed-tools: Bash(git status), Bash(git branch), Bash(git checkout -b:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout main), Bash(git pull), Bash(git branch -d:*), Bash(gh pr list), Bash(gh pr create:*), Bash(gh pr merge:*), Bash(gh pr checks:*), Bash(gh pr view:*), Bash(gh pr status)
description: Commit changes, create/update PR, enable automerge, and wait for merge
---

## Your task

This command automates the entire process of getting changes merged into main:

1. **Check current git status** - Determine if there are uncommitted changes
2. **Handle uncommitted changes** (if any):
   - Check if already on a feature branch, if not create one
   - Stage and commit all changes with an appropriate commit message
   - Push the branch to origin
3. **Check for existing PR**:
   - If PR already exists for current branch, ensure it's up to date
   - If no PR exists, create one with a descriptive title and body
4. **Enable automerge** on the PR (squash merge)
5. **Monitor the PR** until it's merged:
   - Use `gh pr checks --watch` to monitor check statuses in real-time
   - After checks pass, verify merge status
   - Alert when merged successfully or if merge fails
6. **Clean up** after successful merge:
   - Switch back to main branch
   - Pull latest changes
   - Delete the local feature branch

## Important notes

- If on main branch with uncommitted changes, create a feature branch first
- Use conventional commit format for commit messages
- PR title should follow conventional commits format
- Monitor and report PR check statuses while waiting
- Only proceed with cleanup after successful merge
- If merge fails, report the failure reason and leave branch intact for debugging
