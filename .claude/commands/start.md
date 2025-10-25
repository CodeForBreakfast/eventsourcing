---
allowed-tools: Bash(git worktree *), Bash(git fetch:*), Bash(git status:*), Bash(git branch:*), Bash(cd:*), Bash(bun install:*), Bash(pwd:*), Bash(mise trust), Bash(mise install), Bash(git pull:*), Bash(git checkout:*), Bash(git worktree add:*)
description: Start a new piece of work using git worktree
---

## Your task

IMPORTANT: Do not discard any local changes. It is possible that the command is being run in order to prepare to commit them.

IMPORTANT: Always use worktrees for feature development to maintain clean separation from main.

1. **Ensure we're in the repo root and up to date:**
   - Run `pwd` to confirm current location
   - Run `git fetch origin main` to get latest from remote
   - If not in repo root (brownsauce/), navigate back to it first
   - Run `git pull origin main` to update main branch

2. **Create new worktree for feature branch:**
   - Generate appropriate feature name based on the work described by user
   - Use descriptive kebab-case naming: feat/add-user-auth, feat/fix-payment-bug, etc.
   - Run `git worktree add worktrees/{feature-name} -b feat/{feature-name}`
   - This creates both the branch and isolated working directory in the worktrees/ subdirectory

3. **Set up the new worktree:**
   - Change to the new worktree: `cd worktrees/{feature-name}`
   - Run `mise trust` to trust the .mise.toml configuration in the new worktree
   - Run `bun install` to set up dependencies in the new worktree
   - Run `git status` to confirm branch and clean state
   - Run `pwd` to show current worktree location

**Worktree Benefits:**

- Complete isolation from main branch
- Can work on multiple features simultaneously
- No risk of contaminating main with uncommitted changes
- Each worktree has its own node_modules and build artifacts

**Next Steps After Setup:**

1. Make your changes in the isolated worktree
2. Create changeset if affecting published packages
3. Commit with conventional format: "type(scope): description"
4. Use `/automerge` command to handle PR creation and merging
