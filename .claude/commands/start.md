---
allowed-tools: Bash(git checkout *), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git fetch:*), Bash(git pull:*)
description: Start a new piece of work on main
---

## Your task

1. Run `git fetch` to ensure you have the latest from origin
2. Change to main branch if not already on it: `git checkout main`
3. Pull latest changes: `git pull origin main`
4. Run `git status` to confirm you are on main and up to date
5. Run `bun install` to ensure dependencies are up to date

You will then be ready to start a new piece of work. Once you are ready to commit changes:

1. Create a new feature branch: `git checkout -b feat/your-feature-name`
2. Create a changeset describing the changes from a consumer's point of view. What does someone using this package need to know about the changes?
3. ONLY THEN commit changes with an appropriate message including prefix "type($1):", where "type" is one of feat, improve, perf, docs, test, refactor, ci, fix, chore, build, or maintain (as appropriate).
4. Push the branch to origin
